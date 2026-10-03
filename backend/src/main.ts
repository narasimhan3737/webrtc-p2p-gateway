import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/** Comma-separated list, e.g. `http://localhost:3000,https://….ngrok-free.app` */
function parseCorsOrigins(raw: string | undefined): boolean | string | string[] {
  const value = (raw ?? 'http://localhost:3000').trim();
  if (value === '*') return true;
  const list = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length <= 1 ? (list[0] ?? 'http://localhost:3000') : list;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: parseCorsOrigins(config.get<string>('CORS_ORIGIN')),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = Number(config.get('PORT', 3001));
  await app.listen(port);
  console.log(`Backend listening on http://localhost:${port}`);
}
bootstrap();
