import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { useAppConfig } from './state/appConfig';
import { Layout } from './Layout';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { DevicesPage } from './pages/DevicesPage';
import { SimulatorPage } from './pages/SimulatorPage';
import { WatchPage } from './pages/WatchPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireP2p({ children }: { children: React.ReactNode }) {
  const { mediaMode, loading } = useAppConfig();
  if (loading) return <div className="page muted">Loading config…</div>;
  if (mediaMode !== 'p2p') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route
          path="simulator"
          element={
            <RequireP2p>
              <SimulatorPage />
            </RequireP2p>
          }
        />
        <Route
          path="watch/:nvrId"
          element={
            <RequireP2p>
              <WatchPage />
            </RequireP2p>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
