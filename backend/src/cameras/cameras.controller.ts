import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CamerasService } from './cameras.service';
import { CreateCameraDto } from './dto/create-camera.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class CamerasController {
  constructor(private readonly cameras: CamerasService) {}

  @Get('cameras')
  listAll(@CurrentUser() user: AuthUser) {
    return this.cameras.listForOrg(user.organizationId);
  }

  @Get('nvrs/:nvrId/cameras')
  listForNvr(
    @Param('nvrId') nvrId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cameras.listForNvr(nvrId, user.organizationId);
  }

  @Post('nvrs/:nvrId/cameras')
  create(
    @Param('nvrId') nvrId: string,
    @Body() dto: CreateCameraDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cameras.createForNvr(nvrId, dto, user);
  }

  @Delete('cameras/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.cameras.remove(id, user);
  }

  @Get('cameras/:id/stream-info')
  streamInfo(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.cameras.streamInfo(id, user.organizationId);
  }
}
