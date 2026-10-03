import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getNvr } from '../api';
import { useAuth } from '../auth';
import type { IcePolicy, NvrDevice } from '../types';
import { startPeerSession, type PeerSession } from '../webrtc/peer';

export function WatchPage() {
  const { nvrId = '' } = useParams();
  const { token, user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<PeerSession | null>(null);
  const [nvr, setNvr] = useState<NvrDevice | null>(null);
  const [icePolicy, setIcePolicy] = useState<IcePolicy>('all');
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token || !nvrId) return;
    getNvr(token, nvrId)
      .then(setNvr)
      .catch((err: Error) => setError(err.message));
  }, [token, nvrId]);

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  if (!user || !token) return <Navigate to="/login" replace />;

  function start() {
    if (!token || !nvrId) return;
    sessionRef.current?.close();
    setError(null);
    setConnected(true);
    sessionRef.current = startPeerSession({
      token,
      nvrId,
      role: 'viewer',
      icePolicy,
      onRemoteStream: (stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      },
      onStatus: setStatus,
      onError: (msg) => {
        setError(msg);
        setStatus(`Error: ${msg}`);
      },
    });
  }

  function stop() {
    sessionRef.current?.close();
    sessionRef.current = null;
    setConnected(false);
    setStatus('Stopped');
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  return (
    <div className="home-page">
      <header className="home-toolbar">
        <div>
          <span className="live-badge p2p">P2P</span>
          <h1>Watch {nvr?.name ?? 'NVR'}</h1>
          <p className="muted">{user.organization.name}</p>
        </div>
        <Link className="button secondary" to="/">
          Live
        </Link>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="panel media-panel">
        <video ref={videoRef} autoPlay playsInline controls />
        <div className="stack controls">
          <label>
            ICE transport policy
            <select
              value={icePolicy}
              disabled={connected}
              onChange={(e) => setIcePolicy(e.target.value as IcePolicy)}
            >
              <option value="all">all (prefer LAN / host)</option>
              <option value="relay">relay (force TURN)</option>
            </select>
          </label>
          <div className="actions">
            {!connected ? (
              <button type="button" onClick={start}>
                Connect
              </button>
            ) : (
              <button type="button" className="secondary" onClick={stop}>
                Disconnect
              </button>
            )}
          </div>
          <p className="status-line">Status: {status}</p>
        </div>
      </section>
    </div>
  );
}
