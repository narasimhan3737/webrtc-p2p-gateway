export type DmMediaserverMessage = {
  type: string;
  value?: string;
};

export function dmMediaserverHttpBase(override?: string): string {
  const raw =
    override?.trim() ||
    import.meta.env.VITE_DM_MEDIASERVER_BASE ||
    import.meta.env.VITE_GO2RTC_BASE ||
    'http://127.0.0.1:1984';
  return raw.replace(/\/$/, '').replace(/\/\/localhost\b/i, '//127.0.0.1');
}

export function dmMediaserverWsUrl(base: string, src: string): string {
  const origin = base.replace(/\/$/, '');
  const wsOrigin = origin
    .replace(/^http:/i, 'ws:')
    .replace(/^https:/i, 'wss:');
  return `${wsOrigin}/api/ws?src=${encodeURIComponent(src)}`;
}

export const DM_MEDIASERVER_PC_CONFIG: RTCConfiguration = {
  bundlePolicy: 'max-bundle',
  iceServers: [],
};

export function sanitizeSdpForDmMediaserver(
  sdp: string | null | undefined,
): string {
  if (!sdp) return '';
  const lines = sdp.split(/\r?\n/);
  const filtered = lines.filter(
    (l) => l.trim() !== 'a=extmap-allow-mixed' && l.trim() !== '',
  );
  return filtered.join('\r\n') + '\r\n';
}
