export type MediaMode = 'p2p' | 'dm';

/** Accept legacy `go2rtc` as an alias for DM Mediaserver mode. */
export function parseMediaMode(raw: string | undefined): MediaMode {
  const v = (raw ?? 'dm').trim().toLowerCase();
  if (v === 'p2p') return 'p2p';
  return 'dm';
}

export function normalizeDmMediaserverBase(
  raw: string | undefined,
  fallback: string,
): string {
  const base = (raw?.trim() || fallback).replace(/\/$/, '');
  return base.replace(/\/\/localhost\b/i, '//127.0.0.1');
}

export function mediaModeLabel(mode: MediaMode): string {
  return mode === 'p2p' ? 'P2P' : 'DM Mediaserver';
}
