import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { createNvr, listNvrs } from '../api';
import { useAuth } from '../auth';
import type { IcePolicy, NvrDevice } from '../types';
import { startPeerSession, type PeerSession } from '../webrtc/peer';

export function SimulatorPage() {
  const { token, user } = useAuth();
  const localRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<PeerSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [nvrs, setNvrs] = useState<NvrDevice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [icePolicy, setIcePolicy] = useState<IcePolicy>('all');
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const list = await listNvrs(token);
    setNvrs(list);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [token, selectedId]);

  useEffect(() => {
    void refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!user || !token) return <Navigate to="/login" replace />;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    try {
      const nvr = await createNvr(token, newName.trim());
      setNewName('');
      await refresh();
      setSelectedId(nvr.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function start() {
    if (!token || !selectedId) {
      setError('Select or register an NVR first');
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;

      sessionRef.current?.close();
      setPublishing(true);
      sessionRef.current = startPeerSession({
        token,
        nvrId: selectedId,
        role: 'simulator',
        icePolicy,
        localStream: stream,
        onStatus: setStatus,
        onError: (msg) => {
          setError(msg);
          setStatus(`Error: ${msg}`);
        },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Camera/microphone permission denied',
      );
    }
  }

  function stop() {
    sessionRef.current?.close();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (localRef.current) localRef.current.srcObject = null;
    setPublishing(false);
    setStatus('Stopped');
  }

  return (
    <div className="home-page">
      <header className="home-toolbar">
        <div>
          <span className="live-badge p2p">P2P</span>
          <h1>NVR Simulator</h1>
          <p className="muted">Publish webcam via Socket.IO signaling</p>
        </div>
        <Link className="button secondary" to="/">
          Live
        </Link>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="panel media-panel">
        <video ref={localRef} autoPlay playsInline muted />
        <div className="stack controls">
          <label>
            NVR device
            <select
              value={selectedId}
              disabled={publishing}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select…</option>
              {nvrs.map((nvr) => (
                <option key={nvr.id} value={nvr.id}>
                  {nvr.name} ({nvr.status})
                </option>
              ))}
            </select>
          </label>

          <form className="inline-form" onSubmit={onCreate}>
            <input
              value={newName}
              disabled={publishing}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Register new NVR"
            />
            <button type="submit" disabled={publishing}>
              Register
            </button>
          </form>

          <label>
            ICE transport policy
            <select
              value={icePolicy}
              disabled={publishing}
              onChange={(e) => setIcePolicy(e.target.value as IcePolicy)}
            >
              <option value="all">all (prefer LAN / host)</option>
              <option value="relay">relay (force TURN)</option>
            </select>
          </label>

          <div className="actions">
            {!publishing ? (
              <button type="button" onClick={() => void start()}>
                Start publishing
              </button>
            ) : (
              <button type="button" className="secondary" onClick={stop}>
                Stop
              </button>
            )}
          </div>
          <p className="status-line">Status: {status}</p>
        </div>
      </section>
    </div>
  );
}
