import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mediaModeLabel,
  normalizeDmMediaserverBase,
  parseMediaMode,
} from './media-mode';

@Controller('config')
export class AppConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getPublicConfig() {
    const mediaMode = parseMediaMode(this.config.get<string>('MEDIA_MODE'));
    const apiBase = normalizeDmMediaserverBase(
      this.config.get<string>('DM_MEDIASERVER_API_BASE') ??
        this.config.get<string>('GO2RTC_API_BASE'),
      'http://127.0.0.1:1984',
    );
    const dmMediaserverPublicBase = normalizeDmMediaserverBase(
      this.config.get<string>('DM_MEDIASERVER_PUBLIC_BASE') ??
        this.config.get<string>('GO2RTC_PUBLIC_BASE'),
      apiBase,
    );

    return {
      mediaMode,
      mediaModeLabel: mediaModeLabel(mediaMode),
      dmMediaserverPublicBase,
      /** @deprecated use dmMediaserverPublicBase */
      go2rtcPublicBase: dmMediaserverPublicBase,
      signalingPath: '/signaling',
    };
  }
}
