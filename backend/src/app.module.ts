import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { User } from './entities/user.entity';
import { NvrDevice } from './entities/nvr-device.entity';
import { Camera } from './entities/camera.entity';
import { AuthModule } from './auth/auth.module';
import { NvrsModule } from './nvrs/nvrs.module';
import { SignalingModule } from './signaling/signaling.module';
import { SeedModule } from './seed/seed.module';
import { DmMediaserverModule } from './dm-mediaserver/dm-mediaserver.module';
import { CamerasModule } from './cameras/cameras.module';
import { HealthController } from './health.controller';
import { AppConfigController } from './config/config.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DATABASE_HOST', 'localhost'),
        port: Number(config.get<string>('DATABASE_PORT', '5432')),
        username: config.get<string>('DATABASE_USER', 'admin'),
        password: config.get<string>('DATABASE_PASSWORD', 'secretpassword'),
        database: config.get<string>('DATABASE_NAME', 'concept_pro'),
        entities: [Organization, User, NvrDevice, Camera],
        synchronize: true,
      }),
    }),
    AuthModule,
    NvrsModule,
    SignalingModule,
    DmMediaserverModule,
    CamerasModule,
    SeedModule,
  ],
  controllers: [HealthController, AppConfigController],
})
export class AppModule {}
