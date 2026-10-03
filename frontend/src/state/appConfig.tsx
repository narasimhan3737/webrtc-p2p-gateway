import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchAppConfig } from '../api';
import type { AppConfig, Camera, MediaMode } from '../types';

interface AppConfigState {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  mediaMode: MediaMode;
  refresh: () => Promise<void>;
}

const AppConfigContext = createContext<AppConfigState | null>(null);

function normalizeConfig(raw: AppConfig): AppConfig {
  const mode =
    raw.mediaMode === 'p2p'
      ? 'p2p'
      : ('dm' as const);
  const base =
    raw.dmMediaserverPublicBase ||
    raw.go2rtcPublicBase ||
    'http://127.0.0.1:1984';
  return {
    ...raw,
    mediaMode: mode,
    dmMediaserverPublicBase: base,
  };
}

const DEFAULT_CONFIG: AppConfig = {
  mediaMode: 'dm',
  mediaModeLabel: 'DM Mediaserver',
  dmMediaserverPublicBase: 'http://127.0.0.1:1984',
  signalingPath: '/signaling',
};

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConfig(normalizeConfig(await fetchAppConfig()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      config,
      loading,
      error,
      mediaMode: config?.mediaMode ?? 'dm',
      refresh,
    }),
    [config, loading, error, refresh],
  );

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error('useAppConfig must be used within AppConfigProvider');
  return ctx;
}

interface SelectionState {
  selectedCameras: Camera[];
  toggleCamera: (camera: Camera) => void;
  clearSelection: () => void;
  setSelectedCameras: (cameras: Camera[]) => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedCameras, setSelectedCameras] = useState<Camera[]>([]);

  const toggleCamera = useCallback((camera: Camera) => {
    setSelectedCameras((prev) => {
      const exists = prev.some((c) => c.id === camera.id);
      if (exists) return prev.filter((c) => c.id !== camera.id);
      if (prev.length >= 16) return prev;
      return [...prev, camera];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedCameras([]), []);

  const value = useMemo(
    () => ({
      selectedCameras,
      toggleCamera,
      clearSelection,
      setSelectedCameras,
    }),
    [selectedCameras, toggleCamera, clearSelection],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider');
  return ctx;
}
