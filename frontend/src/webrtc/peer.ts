import { io, type Socket } from 'socket.io-client';
import type { IcePolicy } from '../types';

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL ?? 'http://localhost:3001';
const TURN_HOST = import.meta.env.VITE_TURN_HOST ?? '127.0.0.1';
const TURN_USER = import.meta.env.VITE_TURN_USERNAME ?? 'poc_user';
const TURN_PASS = import.meta.env.VITE_TURN_CREDENTIAL ?? 'poc_password';

export type PeerRole = 'simulator' | 'viewer';

export interface PeerSessionOptions {
  token: string;
  nvrId: string;
  role: PeerRole;
  icePolicy: IcePolicy;
  localStream?: MediaStream;
  onRemoteStream?: (stream: MediaStream) => void;
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
}

export interface PeerSession {
  close: () => void;
}

function iceConfig(policy: IcePolicy): RTCConfiguration {
  return {
    iceServers: [
      {
        urls: `turn:${TURN_HOST}:3478`,
        username: TURN_USER,
        credential: TURN_PASS,
      },
      { urls: 'stun:stun.l.google.com:19302' },
    ],
    iceTransportPolicy: policy,
  };
}

/**
 * Perfect negotiation adapted for asymmetric roles:
 * simulator (impolite) publishes tracks; viewer (polite) receives.
 */
export function startPeerSession(opts: PeerSessionOptions): PeerSession {
  const status = (msg: string) => opts.onStatus?.(msg);
  let polite = opts.role === 'viewer';
  let makingOffer = false;
  let ignoreOffer = false;
  let started = false;
  let pc: RTCPeerConnection | null = null;
  let socket: Socket | null = null;

  const send = (event: string, data: unknown) => {
    socket?.emit(event, data);
  };

  const ensurePc = () => {
    if (pc) return pc;
    pc = new RTCPeerConnection(iceConfig(opts.icePolicy));

    pc.ontrack = ({ streams: [stream] }) => {
      opts.onRemoteStream?.(stream);
      status('Remote track received');
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) send('ice', { candidate });
    };

    pc.onconnectionstatechange = () => {
      status(`PC ${pc?.connectionState ?? 'unknown'}`);
    };

    pc.onnegotiationneeded = async () => {
      if (!pc) return;
      try {
        makingOffer = true;
        await pc.setLocalDescription();
        send('description', { description: pc.localDescription });
      } catch (err) {
        opts.onError?.(
          err instanceof Error ? err.message : 'negotiation failed',
        );
      } finally {
        makingOffer = false;
      }
    };

    return pc;
  };

  const startPublishing = () => {
    if (started || opts.role !== 'simulator' || !opts.localStream) return;
    started = true;
    const connection = ensurePc();
    for (const track of opts.localStream.getTracks()) {
      connection.addTrack(track, opts.localStream);
    }
    status('Publishing local tracks');
  };

  const maybeStart = () => {
    if (opts.role === 'simulator') startPublishing();
    else ensurePc();
  };

  socket = io(SIGNALING_URL, {
    path: '/signaling',
    auth: { token: opts.token },
    transports: ['websocket', 'polling'],
    extraHeaders: {
      'ngrok-skip-browser-warning': 'true',
    },
  });

  socket.on('connect', () => {
    status('Signaling connected');
    send('join', { nvrId: opts.nvrId, role: opts.role });
  });

  socket.on('welcome', (msg: { polite: boolean; peers: unknown[] }) => {
    polite = msg.polite;
    status(
      `Joined as ${opts.role} (polite=${polite}), peers=${msg.peers?.length ?? 0}`,
    );
    // Viewer always prepares PC; simulator starts when a peer exists or alone
    // (viewer may join later and trigger negotiation via peer-joined).
    if (opts.role === 'viewer') {
      ensurePc();
    }
    if ((msg.peers?.length ?? 0) > 0) {
      maybeStart();
    }
  });

  socket.on('peer-joined', () => {
    status('Peer joined');
    maybeStart();
  });

  socket.on('peer-left', () => {
    status('Peer left');
  });

  socket.on('error', (msg: { message?: string }) => {
    opts.onError?.(msg.message ?? 'Signaling error');
  });

  socket.on(
    'description',
    async (msg: { description: RTCSessionDescriptionInit }) => {
      const connection = ensurePc();
      const description = msg.description;
      const offerCollision =
        description.type === 'offer' &&
        (makingOffer || connection.signalingState !== 'stable');

      ignoreOffer = !polite && offerCollision;
      if (ignoreOffer) return;

      await connection.setRemoteDescription(description);
      if (description.type === 'offer') {
        await connection.setLocalDescription();
        send('description', { description: connection.localDescription });
      }
    },
  );

  socket.on('ice', async (msg: { candidate: RTCIceCandidateInit }) => {
    try {
      await ensurePc().addIceCandidate(msg.candidate);
    } catch (err) {
      if (!ignoreOffer) {
        opts.onError?.(
          err instanceof Error ? err.message : 'ICE candidate failed',
        );
      }
    }
  });

  socket.on('connect_error', (err) => {
    opts.onError?.(err.message);
  });

  return {
    close() {
      socket?.disconnect();
      socket = null;
      pc?.close();
      pc = null;
    },
  };
}
