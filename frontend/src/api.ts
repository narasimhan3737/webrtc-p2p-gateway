import type {
  AppConfig,
  AuthUser,
  Camera,
  NvrDevice,
  StreamInfo,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function authHeaders(token: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    // Bypass ngrok free-tier browser warning so CORS responses reach the SPA.
    'ngrok-skip-browser-warning': 'true',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token: string | null = null,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...authHeaders(token),
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (body as { message?: string | string[] }).message ??
      `Request failed (${res.status})`;
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }
  return body as T;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export function fetchAppConfig() {
  return request<AppConfig>('/config');
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(payload: {
  email: string;
  password: string;
  displayName: string;
  organizationName?: string;
  joinOrganizationName?: string;
}) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchMe(token: string) {
  return request<AuthUser>('/me', {}, token);
}

export function listNvrs(token: string) {
  return request<NvrDevice[]>('/nvrs', {}, token);
}

export function createNvr(token: string, name: string) {
  return request<NvrDevice>(
    '/nvrs',
    { method: 'POST', body: JSON.stringify({ name }) },
    token,
  );
}

export function getNvr(token: string, id: string) {
  return request<NvrDevice>(`/nvrs/${id}`, {}, token);
}

export function deleteNvr(token: string, id: string) {
  return request<{ ok: boolean }>(`/nvrs/${id}`, { method: 'DELETE' }, token);
}

export function listCameras(token: string) {
  return request<Camera[]>('/cameras', {}, token);
}

export function listNvrCameras(token: string, nvrId: string) {
  return request<Camera[]>(`/nvrs/${nvrId}/cameras`, {}, token);
}

export function createCamera(
  token: string,
  nvrId: string,
  payload: {
    name: string;
    streamKey?: string;
    rtspUrl?: string;
    variant?: 'main' | 'sub';
  },
) {
  return request<Camera>(
    `/nvrs/${nvrId}/cameras`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function deleteCamera(token: string, id: string) {
  return request<{ ok: boolean }>(
    `/cameras/${id}`,
    { method: 'DELETE' },
    token,
  );
}

export function getCameraStreamInfo(token: string, id: string) {
  return request<StreamInfo>(`/cameras/${id}/stream-info`, {}, token);
}

export function dmMediaserverHealth(token: string) {
  return request<{ ok: boolean; base: string; detail?: string }>(
    '/dm-mediaserver/health',
    {},
    token,
  );
}
