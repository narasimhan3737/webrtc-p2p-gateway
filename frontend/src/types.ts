export type MediaMode = 'p2p' | 'dm';

export interface Organization {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  organization: Organization;
}

export interface NvrDevice {
  id: string;
  name: string;
  organizationId: string;
  createdByUserId: string | null;
  status: 'offline' | 'online';
  createdAt: string;
}

export interface Camera {
  id: string;
  name: string;
  nvrId: string;
  organizationId: string;
  streamKey: string;
  rtspUrl: string | null;
  variant: 'main' | 'sub';
  createdAt: string;
  nvr?: NvrDevice;
}

export interface AppConfig {
  mediaMode: MediaMode;
  mediaModeLabel?: string;
  dmMediaserverPublicBase: string;
  /** @deprecated use dmMediaserverPublicBase */
  go2rtcPublicBase?: string;
  signalingPath: string;
}

export interface StreamInfo {
  cameraId: string;
  name: string;
  streamKey: string;
  variant: 'main' | 'sub';
  httpBase: string;
  wsUrl: string;
}

export type IcePolicy = 'all' | 'relay';

export function mediaModeLabel(mode: MediaMode): string {
  return mode === 'p2p' ? 'P2P' : 'DM Mediaserver';
}
