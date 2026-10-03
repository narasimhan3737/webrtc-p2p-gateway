import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Camera } from '../entities/camera.entity';
import { NvrsModule } from '../nvrs/nvrs.module';
import { DmMediaserverModule } from '../dm-mediaserver/dm-mediaserver.module';
import { CamerasService } from './cameras.service';
import { CamerasController } from './cameras.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Camera]),
    NvrsModule,
    DmMediaserverModule,
  ],
  controllers: [CamerasController],
  providers: [CamerasService],
  exports: [CamerasService],
})
export class CamerasModule {}
