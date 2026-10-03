import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { NvrDevice } from '../entities/nvr-device.entity';
import { Camera } from '../entities/camera.entity';

const NVR2_CAMERAS: Array<{
  name: string;
  streamKey: string;
  rtspUrl: string;
  variant: 'main' | 'sub';
}> = [
  {
    name: 'CAM 1',
    streamKey: 'NVR2_CAM_1_LOW',
    rtspUrl:
      'rtsp://ADMIN:Concept%23123@192.168.1.122:554/live/2/1#transport=tcp',
    variant: 'sub',
  },
  {
    name: 'CAM 2',
    streamKey: 'NVR2_CAM_2_LOW',
    rtspUrl:
      'rtsp://ADMIN:Concept%23123@192.168.1.122:554/live/2/2#transport=tcp',
    variant: 'sub',
  },
  {
    name: 'CAM 3',
    streamKey: 'NVR2_CAM_3_LOW',
    rtspUrl:
      'rtsp://ADMIN:Concept%23123@192.168.1.122:554/live/2/3#transport=tcp',
    variant: 'sub',
  },
  {
    name: 'CAM 4',
    streamKey: 'NVR2_CAM_4_LOW',
    rtspUrl:
      'rtsp://ADMIN:Concept%23123@192.168.1.122:554/live/2/4#transport=tcp',
    variant: 'sub',
  },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly orgs: Repository<Organization>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(NvrDevice)
    private readonly nvrs: Repository<NvrDevice>,
    @InjectRepository(Camera)
    private readonly cameras: Repository<Camera>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  private async seed() {
    const existing = await this.orgs.findOne({
      where: { name: 'Acme Security' },
    });
    if (existing) {
      await this.ensureDemoCameras();
      this.logger.log('Seed data already present — ensured NVR2 demo cameras');
      return;
    }

    const passwordHash = await bcrypt.hash('poc', 10);

    const acme = await this.orgs.save(
      this.orgs.create({ name: 'Acme Security' }),
    );
    const beta = await this.orgs.save(
      this.orgs.create({ name: 'Beta Monitoring' }),
    );

    const alice = await this.users.save(
      this.users.create({
        email: 'alice@acme.local',
        passwordHash,
        displayName: 'Alice',
        role: 'admin',
        organizationId: acme.id,
      }),
    );
    await this.users.save(
      this.users.create({
        email: 'bob@acme.local',
        passwordHash,
        displayName: 'Bob',
        role: 'member',
        organizationId: acme.id,
      }),
    );
    const carol = await this.users.save(
      this.users.create({
        email: 'carol@beta.local',
        passwordHash,
        displayName: 'Carol',
        role: 'admin',
        organizationId: beta.id,
      }),
    );

    const frontGate = await this.nvrs.save(
      this.nvrs.create({
        name: 'Front Gate',
        organizationId: acme.id,
        createdByUserId: alice.id,
        status: 'offline',
      }),
    );
    await this.nvrs.save(
      this.nvrs.create({
        name: 'Lobby Cam',
        organizationId: beta.id,
        createdByUserId: carol.id,
        status: 'offline',
      }),
    );

    await this.seedCamerasForNvr(frontGate, NVR2_CAMERAS);

    this.logger.log(
      'Seeded Acme Security (alice/bob) and Beta Monitoring (carol) — password: poc',
    );
  }

  private async ensureDemoCameras() {
    const frontGate = await this.nvrs.findOne({
      where: { name: 'Front Gate' },
    });
    if (!frontGate) return;

    const existing = await this.cameras.find({
      where: { nvrId: frontGate.id },
    });
    const hasNvr2 = existing.some((c) =>
      c.streamKey.startsWith('NVR2_CAM_'),
    );
    const hasLegacy = existing.some(
      (c) =>
        c.streamKey.includes('VXH5AHDE') || c.streamKey.includes('VUHDIP'),
    );

    if (hasLegacy || !hasNvr2) {
      if (existing.length > 0) {
        await this.cameras.remove(existing);
      }
      await this.seedCamerasForNvr(frontGate, NVR2_CAMERAS);
      this.logger.log('Replaced Front Gate cameras with NVR2_CAM_*_LOW');
    }
  }

  private async seedCamerasForNvr(
    nvr: NvrDevice,
    cams: Array<{
      name: string;
      streamKey: string;
      rtspUrl?: string | null;
      variant: 'main' | 'sub';
    }>,
  ) {
    for (const cam of cams) {
      await this.cameras.save(
        this.cameras.create({
          name: cam.name,
          nvrId: nvr.id,
          organizationId: nvr.organizationId,
          streamKey: cam.streamKey,
          rtspUrl: cam.rtspUrl ?? null,
          variant: cam.variant,
        }),
      );
    }
  }
}
