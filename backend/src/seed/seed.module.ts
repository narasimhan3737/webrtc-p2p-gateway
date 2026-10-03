import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { NvrDevice } from '../entities/nvr-device.entity';
import { Camera } from '../entities/camera.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, User, NvrDevice, Camera]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
