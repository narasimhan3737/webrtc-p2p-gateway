import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeDmMediaserverBase } from '../config/media-mode';

@Injectable()
export class DmMediaserverService {
  private readonly logger = new Logger(DmMediaserverService.name);

  constructor(private readonly config: ConfigService) {}

  apiBase(): string {
    return normalizeDmMediaserverBase(
      this.config.get<string>('DM_MEDIASERVER_API_BASE') ??
        this.config.get<string>('GO2RTC_API_BASE'),
      'http://127.0.0.1:1984',
    );
  }

  publicBase(): string {
    return normalizeDmMediaserverBase(
      this.config.get<string>('DM_MEDIASERVER_PUBLIC_BASE') ??
        this.config.get<string>('GO2RTC_PUBLIC_BASE'),
      this.apiBase(),
    );
  }

  sanitizeStreamKey(name: string): string {
    return name.trim().replace(/[^\w.-]+/g, '_');
  }

  buildWsUrl(streamKey: string): string {
    const origin = this.publicBase();
    const wsOrigin = origin
      .replace(/^http:/i, 'ws:')
      .replace(/^https:/i, 'wss:');
    return `${wsOrigin}/api/ws?src=${encodeURIComponent(streamKey)}`;
  }

  async health(): Promise<{ ok: boolean; base: string; detail?: string }> {
    const base = this.apiBase();
    try {
      const res = await fetch(`${base}/api/streams`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { ok: false, base, detail: `HTTP ${res.status}` };
      }
      return { ok: true, base };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, base, detail };
    }
  }

  async listStreams(): Promise<unknown> {
    const res = await fetch(`${this.apiBase()}/api/streams`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `DM Mediaserver list failed: HTTP ${res.status} ${text}`,
      );
    }
    return res.json();
  }

  async registerStream(streamKey: string, rtspUrl: string): Promise<boolean> {
    const key = this.sanitizeStreamKey(streamKey);
    const src = rtspUrl.includes('#') ? rtspUrl : `${rtspUrl}#transport=tcp`;
    const url = `${this.apiBase()}/api/streams?name=${encodeURIComponent(key)}&src=${encodeURIComponent(src)}`;

    try {
      const res = await fetch(url, { method: 'PUT' });
      if (res.ok) {
        this.logger.log(`Registered DM Mediaserver stream '${key}'`);
        await res.text().catch(() => undefined);
        return true;
      }
      const detail = await res.text().catch(() => '');
      this.logger.error(
        `Failed to register '${key}': HTTP ${res.status} ${detail}`,
      );
      return false;
    } catch (err) {
      this.logger.error(
        `DM Mediaserver unreachable registering '${key}': ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  async unregisterStream(streamKey: string): Promise<boolean> {
    const key = this.sanitizeStreamKey(streamKey);
    const url = `${this.apiBase()}/api/streams?src=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      this.logger.warn(
        `DM Mediaserver unregister '${key}' failed: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}
