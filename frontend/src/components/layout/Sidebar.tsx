import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { listCameras, listNvrs } from '../../api';
import { useAuth } from '../../auth';
import { useAppConfig, useSelection } from '../../state/appConfig';
import type { Camera, NvrDevice } from '../../types';

export function Sidebar() {
  const { token, user, logout } = useAuth();
  const { mediaMode } = useAppConfig();
  const { selectedCameras, toggleCamera, clearSelection } = useSelection();
  const [nvrs, setNvrs] = useState<NvrDevice[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [nvrList, camList] = await Promise.all([
        listNvrs(token),
        mediaMode === 'dm' ? listCameras(token) : Promise.resolve([]),
      ]);
      setNvrs(nvrList);
      setCameras(camList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    }
  }, [token, mediaMode]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const camerasByNvr = useMemo(() => {
    const map = new Map<string, Camera[]>();
    for (const cam of cameras) {
      const list = map.get(cam.nvrId) ?? [];
      list.push(cam);
      map.set(cam.nvrId, list);
    }
    return map;
  }, [cameras]);

  const selectedIds = useMemo(
    () => new Set(selectedCameras.map((c) => c.id)),
    [selectedCameras],
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <p className="brand">Concept Pro</p>
        <p className="muted sidebar-org">{user?.organization.name}</p>
        <p className="mode-chip">{mediaMode === 'dm' ? 'DM Mediaserver' : 'P2P'}</p>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/" end>
          Live
        </NavLink>
        <NavLink to="/devices">Devices</NavLink>
        {mediaMode === 'p2p' ? (
          <NavLink to="/simulator">Simulator</NavLink>
        ) : null}
      </nav>

      <div className="sidebar-section">
        <div className="section-head">
          <h2>Devices</h2>
          {mediaMode === 'dm' && selectedCameras.length > 0 ? (
            <button type="button" className="secondary tiny" onClick={clearSelection}>
              Clear
            </button>
          ) : null}
        </div>

        {error ? <p className="error compact">{error}</p> : null}

        <ul className="device-tree">
          {nvrs.map((nvr) => (
            <li key={nvr.id}>
              <div className="device-nvr">
                <strong>{nvr.name}</strong>
                <span className={`status ${nvr.status}`}>{nvr.status}</span>
              </div>
              {mediaMode === 'dm' ? (
                <ul className="device-cams">
                  {(camerasByNvr.get(nvr.id) ?? []).map((cam) => (
                    <li key={cam.id}>
                      <button
                        type="button"
                        className={`cam-btn ${selectedIds.has(cam.id) ? 'selected' : ''}`}
                        onClick={() => toggleCamera(cam)}
                      >
                        {cam.name}
                        <span className="muted">{cam.variant}</span>
                      </button>
                    </li>
                  ))}
                  {(camerasByNvr.get(nvr.id) ?? []).length === 0 ? (
                    <li className="muted tiny-pad">No cameras</li>
                  ) : null}
                </ul>
              ) : (
                <div className="p2p-nvr-actions">
                  <NavLink className="button secondary tiny" to={`/watch/${nvr.id}`}>
                    Watch
                  </NavLink>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-footer">
        <p className="muted">
          {user?.displayName} · {user?.role}
        </p>
        <button type="button" className="secondary" onClick={logout}>
          Log out
        </button>
      </div>
    </aside>
  );
}
