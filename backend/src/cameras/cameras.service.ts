import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from '../entities/camera.entity';
import { NvrsService } from '../nvrs/nvrs.service';
import { DmMediaserverService } from '../dm-mediaserver/dm-mediaserver.service';
import { AuthUser } from '../auth/auth.types';
import { CreateCameraDto } from './dto/create-camera.dto';

@Injectable()
export class CamerasService {
  constructor(
    @InjectRepository(Camera)
    private readonly cameras: Repository<Camera>,
    private readonly nvrs: NvrsService,
    private readonly dmMediaserver: DmMediaserverService,
  ) {}

  listForOrg(organizationId: string) {
    return this.cameras.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
      relations: { nvr: true },
    });
  }

  listForNvr(nvrId: string, organizationId: string) {
    return this.nvrs.getForOrg(nvrId, organizationId).then(() =>
      this.cameras.find({
        where: { nvrId, organizationId },
        order: { createdAt: 'ASC' },
      }),
    );
  }

  async getForOrg(id: string, organizationId: string) {
    const camera = await this.cameras.findOne({
      where: { id },
      relations: { nvr: true },
    });
    if (!camera) {
      throw new NotFoundException('Camera not found');
    }
    if (camera.organizationId !== organizationId) {
      throw new ForbiddenException('Camera belongs to another organization');
    }
    return camera;
  }

  async createForNvr(nvrId: string, dto: CreateCameraDto, user: AuthUser) {
    const nvr = await this.nvrs.getForOrg(nvrId, user.organizationId);

    const rtspUrl = dto.rtspUrl?.trim() || null;
    let streamKey = dto.streamKey?.trim() || '';

    if (!streamKey && !rtspUrl) {
      throw new BadRequestException('Provide streamKey and/or rtspUrl');
    }

    if (!streamKey && rtspUrl) {
      streamKey = this.dmMediaserver.sanitizeStreamKey(
        `${nvr.name}_${dto.name}`.replace(/\s+/g, '_'),
      );
    } else {
      streamKey = this.dmMediaserver.sanitizeStreamKey(streamKey);
    }

    if (rtspUrl) {
      const ok = await this.dmMediaserver.registerStream(streamKey, rtspUrl);
      if (!ok) {
        throw new BadRequestException(
          'Failed to register stream on DM Mediaserver — is DM_MEDIASERVER_API_BASE reachable?',
        );
      }
    }

    const variant =
      dto.variant ??
      (streamKey.toUpperCase().endsWith('_LOW') ? 'sub' : 'main');

    const camera = this.cameras.create({
      name: dto.name.trim(),
      nvrId: nvr.id,
      organizationId: user.organizationId,
      streamKey,
      rtspUrl,
      variant,
    });
    return this.cameras.save(camera);
  }

  async remove(id: string, user: AuthUser) {
    const camera = await this.getForOrg(id, user.organizationId);
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can delete cameras');
    }
    if (camera.rtspUrl) {
      await this.dmMediaserver.unregisterStream(camera.streamKey);
    }
    await this.cameras.remove(camera);
    return { ok: true };
  }

  async streamInfo(id: string, organizationId: string) {
    const camera = await this.getForOrg(id, organizationId);
    const httpBase = this.dmMediaserver.publicBase();
    return {
      cameraId: camera.id,
      name: camera.name,
      streamKey: camera.streamKey,
      variant: camera.variant,
      httpBase,
      wsUrl: this.dmMediaserver.buildWsUrl(camera.streamKey),
    };
  }
}
