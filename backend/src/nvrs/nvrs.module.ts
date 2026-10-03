import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NvrDevice } from '../entities/nvr-device.entity';
import { NvrsService } from './nvrs.service';
import { NvrsController } from './nvrs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([NvrDevice])],
  controllers: [NvrsController],
  providers: [NvrsService],
  exports: [NvrsService],
})
export class NvrsModule {}
