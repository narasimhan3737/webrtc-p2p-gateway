import { Module } from '@nestjs/common';
import { DmMediaserverService } from './dm-mediaserver.service';
import { DmMediaserverController } from './dm-mediaserver.controller';

@Module({
  controllers: [DmMediaserverController],
  providers: [DmMediaserverService],
  exports: [DmMediaserverService],
})
export class DmMediaserverModule {}
