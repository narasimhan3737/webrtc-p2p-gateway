import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createCamera,
  createNvr,
  deleteCamera,
  deleteNvr,
  dmMediaserverHealth,
  listCameras,
  listNvrs,
} from '../api';
import { useAuth } from '../auth';
import { useAppConfig } from '../state/appConfig';
import type { Camera, NvrDevice } from '../types';
import { mediaModeLabel } from '../types';

export function DevicesPage() {
  const { token, user } = useAuth();
  const { mediaMode } = useAppConfig();
  const [nvrs, setNvrs] = useState<NvrDevice[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [nvrName, setNvrName] = useState('');
  const [selectedNvrId, setSelectedNvrId] = useState('');
  const [camName, setCamName] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<string>('—');

  const refresh = useCallback(async () => {
    if (!token) return;
    const [nvrList, camList] = await Promise.all([
      listNvrs(token),
      listCameras(token),
    ]);
    setNvrs(nvrList);
    setCameras(camList);
    if (!selectedNvrId && nvrList[0]) setSelectedNvrId(nvrList[0].id);
  }, [token, selectedNvrId]);

  useEffect(() => {
    void refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    void dmMediaserverHealth(token)
      .then((h) =>
        setHealth(h.ok ? `ok (${h.base})` : `down (${h.detail ?? h.base})`),
      )
      .catch((err: Error) => setHealth(err.message));
  }, [token]);

  async function onCreateNvr(e: FormEvent) {
    e.preventDefault();
    if (!token || !nvrName.trim()) return;
    setError(null);
    try {
      const nvr = await createNvr(token, nvrName.trim());
      setNvrName('');
      await refresh();
      setSelectedNvrId(nvr.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create NVR failed');
    }
  }

  async function onCreateCamera(e: FormEvent) {
    e.preventDefault();
    if (!token || !selectedNvrId || !camName.trim()) return;
    if (!streamKey.trim() && !rtspUrl.trim()) {
      setError('Provide a streamKey and/or rtspUrl');
      return;
    }
    setError(null);
    try {
      await createCamera(token, selectedNvrId, {
        name: camName.trim(),
        ...(streamKey.trim() ? { streamKey: streamKey.trim() } : {}),
        ...(rtspUrl.trim() ? { rtspUrl: rtspUrl.trim() } : {}),
      });
      setCamName('');
      setStreamKey('');
      setRtspUrl('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create camera failed');
    }
  }

  return (
    <div className="devices-page">
      <header className="home-toolbar">
        <div>
          <h1>Devices</h1>
          <p className="muted">
            Mode: {mediaModeLabel(mediaMode)} · DM Mediaserver: {health}
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <h2>NVRs</h2>
        <form className="inline-form" onSubmit={onCreateNvr}>
          <input
            value={nvrName}
            onChange={(e) => setNvrName(e.target.value)}
            placeholder="New NVR name"
          />
          <button type="submit">Add NVR</button>
        </form>
        <ul className="nvr-list">
          {nvrs.map((nvr) => (
            <li key={nvr.id}>
              <div>
                <strong>{nvr.name}</strong>{' '}
                <span className={`status ${nvr.status}`}>{nvr.status}</span>
              </div>
              <div className="actions">
                {user?.role === 'admin' ? (
                  <button
                    type="button"
                    className="secondary danger"
                    onClick={() =>
                      void deleteNvr(token!, nvr.id)
                        .then(refresh)
                        .catch((err: Error) => setError(err.message))
                    }
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Cameras (DM Mediaserver)</h2>
        <p className="muted hint">
          Import an existing DM Mediaserver stream key, or provide an RTSP URL to
          register.
        </p>
        <form className="stack" onSubmit={onCreateCamera}>
          <label>
            NVR
            <select
              value={selectedNvrId}
              onChange={(e) => setSelectedNvrId(e.target.value)}
            >
              <option value="">Select…</option>
              {nvrs.map((nvr) => (
                <option key={nvr.id} value={nvr.id}>
                  {nvr.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Camera name
            <input value={camName} onChange={(e) => setCamName(e.target.value)} />
          </label>
          <label>
            Stream key (optional if RTSP set)
            <input
              value={streamKey}
              onChange={(e) => setStreamKey(e.target.value)}
              placeholder="NVR2_CAM_1_LOW"
            />
          </label>
          <label>
            RTSP URL (optional if stream key set)
            <input
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              placeholder="rtsp://user:pass@host/live/second0"
            />
          </label>
          <button type="submit">Add camera</button>
        </form>

        <ul className="nvr-list" style={{ marginTop: '1rem' }}>
          {cameras.map((cam) => (
            <li key={cam.id}>
              <div>
                <strong>{cam.name}</strong>
                <div className="muted">
                  {cam.streamKey} · {cam.variant}
                </div>
              </div>
              {user?.role === 'admin' ? (
                <button
                  type="button"
                  className="secondary danger"
                  onClick={() =>
                    void deleteCamera(token!, cam.id)
                      .then(refresh)
                      .catch((err: Error) => setError(err.message))
                  }
                >
                  Delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
