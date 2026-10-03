import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NvrsModule } from '../nvrs/nvrs.module';
import { SignalingGateway } from './signaling.gateway';
import { SignalingRedisService } from './signaling-redis.service';

@Module({
  imports: [AuthModule, NvrsModule],
  providers: [SignalingGateway, SignalingRedisService],
})
export class SignalingModule {}
