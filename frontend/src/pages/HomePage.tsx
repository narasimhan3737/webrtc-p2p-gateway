import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmMediaserverHealth, listNvrs } from '../api';
import { useAuth } from '../auth';
import { StreamLayout } from '../components/StreamLayout';
import { useAppConfig, useSelection } from '../state/appConfig';
import type { NvrDevice } from '../types';

function autoGridSize(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

export function HomePage() {
  const { token, user } = useAuth();
  const { mediaMode, config } = useAppConfig();
  const { selectedCameras } = useSelection();
  const [gridSize, setGridSize] = useState(2);
  const [autoGrid, setAutoGrid] = useState(true);
  const [nvrs, setNvrs] = useState<NvrDevice[]>([]);
  const [dmOk, setDmOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    void listNvrs(token).then(setNvrs).catch(() => setNvrs([]));
  }, [token]);

  useEffect(() => {
    if (!token || mediaMode !== 'dm') return;
    void dmMediaserverHealth(token)
      .then((h) => setDmOk(h.ok))
      .catch(() => setDmOk(false));
  }, [token, mediaMode]);

  useEffect(() => {
    if (autoGrid) setGridSize(autoGridSize(selectedCameras.length || 1));
  }, [selectedCameras.length, autoGrid]);

  const subtitle = useMemo(() => {
    if (mediaMode === 'dm') {
      return `${selectedCameras.length} camera(s) · DM Mediaserver ${config?.dmMediaserverPublicBase ?? ''}`;
    }
    return 'P2P mode — use Simulator to publish, Watch to view';
  }, [mediaMode, selectedCameras.length, config?.dmMediaserverPublicBase]);

  if (mediaMode === 'p2p') {
    return (
      <div className="home-page">
        <header className="home-toolbar">
          <div>
            <span className="live-badge p2p">P2P</span>
            <h1>{user?.organization.name}</h1>
            <p className="muted">{subtitle}</p>
          </div>
          <Link className="button" to="/simulator">
            Open Simulator
          </Link>
        </header>

        <section className="panel">
          <h2>Organization NVRs</h2>
          <ul className="nvr-list">
            {nvrs.map((nvr) => (
              <li key={nvr.id}>
                <div>
                  <strong>{nvr.name}</strong>{' '}
                  <span className={`status ${nvr.status}`}>{nvr.status}</span>
                </div>
                <div className="actions">
                  <Link className="button secondary" to={`/watch/${nvr.id}`}>
                    Watch
                  </Link>
                </div>
              </li>
            ))}
            {nvrs.length === 0 ? (
              <li className="muted">No NVRs yet — register one in Simulator.</li>
            ) : null}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="home-page live">
      <header className="home-toolbar">
        <div className="home-toolbar-left">
          <span className="live-badge">LIVE</span>
          <div>
            <h1>Live view</h1>
            <p className="muted">{subtitle}</p>
          </div>
          {dmOk === false ? (
            <span className="error compact">DM Mediaserver unreachable</span>
          ) : dmOk ? (
            <span className="status online">DM Mediaserver ok</span>
          ) : null}
        </div>
        <div className="grid-controls">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={autoGrid}
              onChange={(e) => setAutoGrid(e.target.checked)}
            />
            Auto grid
          </label>
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={`secondary tiny ${!autoGrid && gridSize === n ? 'active' : ''}`}
              disabled={autoGrid}
              onClick={() => setGridSize(n)}
            >
              {n}×{n}
            </button>
          ))}
        </div>
      </header>

      <div className="live-stage">
        <StreamLayout cameras={selectedCameras} gridSize={gridSize} />
      </div>
    </div>
  );
}
