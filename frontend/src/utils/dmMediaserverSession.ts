import {
  DM_MEDIASERVER_PC_CONFIG,
  dmMediaserverHttpBase,
  dmMediaserverWsUrl,
  sanitizeSdpForDmMediaserver,
  type DmMediaserverMessage,
} from './dmMediaserver';

const WS_OPEN_TIMEOUT_MS = 10_000;
const WEBRTC_CONNECT_TIMEOUT_MS = 25_000;

export type DmMediaserverSessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'error';

export type RunDmMediaserverSessionParams = {
  src: string;
  httpBase?: string;
  wsUrl?: string;
  video: HTMLVideoElement;
  isStale: () => boolean;
  onStatus?: (status: DmMediaserverSessionStatus, detail?: string) => void;
};

export type DmMediaserverSessionHandle = {
  close: () => void;
};

function closePc(pc: RTCPeerConnection | null) {
  if (!pc) return;
  try {
    pc.getTransceivers().forEach((tr) => {
      try {
        tr.stop();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
  try {
    pc.close();
  } catch {
    /* ignore */
  }
}

function closeWs(ws: WebSocket | null) {
  if (!ws) return;
  try {
    ws.close();
  } catch {
    /* ignore */
  }
}

/** Slim DM Mediaserver WebRTC session (VideoRTC /api/ws protocol). */
export function startDmMediaserverSession(
  params: RunDmMediaserverSessionParams,
): DmMediaserverSessionHandle {
  let closed = false;
  let pc: RTCPeerConnection | null = null;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const { video, isStale, onStatus } = params;

  const cleanup = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    closeWs(ws);
    ws = null;
    closePc(pc);
    pc = null;
    if (video.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  };

  void (async () => {
    onStatus?.('connecting');
    const base = dmMediaserverHttpBase(params.httpBase);
    const url =
      params.wsUrl?.trim() || dmMediaserverWsUrl(base, params.src);

    try {
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('WebSocket open timeout')),
          WS_OPEN_TIMEOUT_MS,
        );
        ws!.onopen = () => {
          clearTimeout(t);
          resolve();
        };
        ws!.onerror = () => {
          clearTimeout(t);
          reject(new Error('WebSocket error'));
        };
      });

      if (closed || isStale()) {
        cleanup();
        return;
      }

      pc = new RTCPeerConnection(DM_MEDIASERVER_PC_CONFIG);
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      const pending: RTCIceCandidateInit[] = [];
      let remoteSet = false;

      const sendJson = (payload: object) => {
        if (closed || !ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify(payload));
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate?.candidate) {
          sendJson({ type: 'webrtc/candidate', value: ev.candidate.candidate });
        }
      };

      pc.ontrack = (ev) => {
        if (closed || isStale()) return;
        const stream =
          ev.streams[0] ??
          new MediaStream(
            pc
              ? (pc
                  .getReceivers()
                  .map((r) => r.track)
                  .filter(Boolean) as MediaStreamTrack[])
              : [],
          );
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        void video.play().catch(() => undefined);
      };

      let resolveConn: ((ok: boolean) => void) | null = null;
      const connected = new Promise<boolean>((resolve) => {
        resolveConn = resolve;
      });

      pc.onconnectionstatechange = () => {
        if (!pc || closed) return;
        if (pc.connectionState === 'connected') {
          resolveConn?.(true);
        } else if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          resolveConn?.(false);
        }
      };

      ws.onmessage = (ev) => {
        if (closed || isStale() || typeof ev.data !== 'string' || !pc) return;
        let msg: DmMediaserverMessage;
        try {
          msg = JSON.parse(ev.data) as DmMediaserverMessage;
        } catch {
          return;
        }
        if (msg.type === 'error') {
          onStatus?.('error', msg.value ?? 'DM Mediaserver error');
          resolveConn?.(false);
          return;
        }
        void (async () => {
          if (!pc || closed) return;
          if (msg.type === 'webrtc/answer' && msg.value) {
            try {
              await pc.setRemoteDescription({
                type: 'answer',
                sdp: msg.value,
              });
              remoteSet = true;
              for (const init of pending.splice(0)) {
                try {
                  if (init.candidate) await pc.addIceCandidate(init);
                  else await pc.addIceCandidate();
                } catch {
                  /* ignore */
                }
              }
            } catch (err) {
              onStatus?.(
                'error',
                err instanceof Error ? err.message : 'setRemoteDescription failed',
              );
              resolveConn?.(false);
            }
          } else if (msg.type === 'webrtc/candidate') {
            const candRaw = msg.value ?? '';
            const init: RTCIceCandidateInit = candRaw
              ? { candidate: candRaw, sdpMid: '0' }
              : { candidate: '' };
            if (!remoteSet) pending.push(init);
            else {
              try {
                if (init.candidate) await pc.addIceCandidate(init);
                else await pc.addIceCandidate();
              } catch {
                /* ignore */
              }
            }
          }
        })();
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendJson({
        type: 'webrtc/offer',
        value: sanitizeSdpForDmMediaserver(offer.sdp),
      });

      timer = setTimeout(() => resolveConn?.(false), WEBRTC_CONNECT_TIMEOUT_MS);
      const ok = await connected;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }

      if (closed || isStale()) {
        cleanup();
        return;
      }
      if (ok) {
        onStatus?.('connected');
      } else {
        onStatus?.('error', 'WebRTC connection failed');
        cleanup();
      }
    } catch (err) {
      if (!closed) {
        onStatus?.(
          'error',
          err instanceof Error ? err.message : 'Session failed',
        );
      }
      cleanup();
    }
  })();

  return {
    close: () => {
      closed = true;
      cleanup();
      onStatus?.('idle');
    },
  };
}
