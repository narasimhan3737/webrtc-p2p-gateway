import { useEffect, useRef, useState } from 'react';
import { getCameraStreamInfo } from '../api';
import { useAuth } from '../auth';
import { useAppConfig } from '../state/appConfig';
import type { Camera } from '../types';
import {
  startDmMediaserverSession,
  type DmMediaserverSessionHandle,
  type DmMediaserverSessionStatus,
} from '../utils/dmMediaserverSession';

type Props = {
  camera: Camera;
  connectEnabled?: boolean;
};

export function WebRTCPlayer({ camera, connectEnabled = true }: Props) {
  const { token } = useAuth();
  const { config } = useAppConfig();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<DmMediaserverSessionHandle | null>(null);
  const sessionIdRef = useRef(0);
  const [status, setStatus] = useState<DmMediaserverSessionStatus>('idle');
  const [detail, setDetail] = useState<string | undefined>();

  useEffect(() => {
    if (!connectEnabled || !token || !videoRef.current) {
      sessionRef.current?.close();
      sessionRef.current = null;
      setStatus('idle');
      return;
    }

    const video = videoRef.current;
    const sessionId = ++sessionIdRef.current;
    let cancelled = false;

    void (async () => {
      try {
        const info = await getCameraStreamInfo(token, camera.id);
        if (cancelled || sessionId !== sessionIdRef.current) return;

        sessionRef.current?.close();
        sessionRef.current = startDmMediaserverSession({
          src: info.streamKey,
          httpBase: info.httpBase || config?.dmMediaserverPublicBase,
          wsUrl: info.wsUrl,
          video,
          isStale: () => cancelled || sessionId !== sessionIdRef.current,
          onStatus: (s, d) => {
            if (cancelled || sessionId !== sessionIdRef.current) return;
            setStatus(s);
            setDetail(d);
          },
        });
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setDetail(err instanceof Error ? err.message : 'stream-info failed');
        }
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [camera.id, connectEnabled, token, config?.dmMediaserverPublicBase]);

  const statusClass =
    status === 'connected'
      ? 'online'
      : status === 'error'
        ? 'error-dot'
        : status === 'connecting'
          ? 'connecting'
          : 'offline';

  return (
    <div className="stream-tile">
      <video ref={videoRef} autoPlay playsInline muted />
      <div className="stream-tile-chrome">
        <span className={`status-dot ${statusClass}`} title={detail ?? status} />
        <span className="stream-tile-label">{camera.name}</span>
        {status === 'error' && detail ? (
          <span className="stream-tile-error">{detail}</span>
        ) : null}
      </div>
    </div>
  );
}
