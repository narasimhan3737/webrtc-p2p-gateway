import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NvrDevice, NvrStatus } from '../entities/nvr-device.entity';
import { AuthUser } from '../auth/auth.types';
import { CreateNvrDto } from './dto/create-nvr.dto';

@Injectable()
export class NvrsService {
  constructor(
    @InjectRepository(NvrDevice)
    private readonly nvrs: Repository<NvrDevice>,
  ) {}

  listForOrg(organizationId: string) {
    return this.nvrs.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
    });
  }

  async getForOrg(id: string, organizationId: string) {
    const nvr = await this.nvrs.findOne({ where: { id } });
    if (!nvr) {
      throw new NotFoundException('NVR not found');
    }
    if (nvr.organizationId !== organizationId) {
      throw new ForbiddenException('NVR belongs to another organization');
    }
    return nvr;
  }

  create(dto: CreateNvrDto, user: AuthUser) {
    const nvr = this.nvrs.create({
      name: dto.name,
      organizationId: user.organizationId,
      createdByUserId: user.userId,
      status: 'offline',
    });
    return this.nvrs.save(nvr);
  }

  async remove(id: string, user: AuthUser) {
    const nvr = await this.getForOrg(id, user.organizationId);
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can delete NVRs');
    }
    await this.nvrs.remove(nvr);
    return { ok: true };
  }

  async setStatus(id: string, status: NvrStatus) {
    await this.nvrs.update({ id }, { status });
  }
}
