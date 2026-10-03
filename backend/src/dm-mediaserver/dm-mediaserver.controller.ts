import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DmMediaserverService } from './dm-mediaserver.service';

@Controller('dm-mediaserver')
@UseGuards(JwtAuthGuard)
export class DmMediaserverController {
  constructor(private readonly dmMediaserver: DmMediaserverService) {}

  @Get('health')
  health() {
    return this.dmMediaserver.health();
  }

  @Get('streams')
  listStreams() {
    return this.dmMediaserver.listStreams();
  }
}
