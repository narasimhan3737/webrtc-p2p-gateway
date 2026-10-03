import { Outlet } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { SelectionProvider } from './state/appConfig';

export function Layout() {
  return (
    <SelectionProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </SelectionProvider>
  );
}
