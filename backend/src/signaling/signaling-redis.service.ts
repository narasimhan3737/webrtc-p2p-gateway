import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class SignalingRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(SignalingRedisService.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly handlers = new Map<
    string,
    Set<(message: string) => void>
  >();

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.publisher = new Redis(url);
    this.subscriber = new Redis(url);

    this.subscriber.on('message', (channel, message) => {
      const set = this.handlers.get(channel);
      if (!set) return;
      for (const handler of set) {
        handler(message);
      }
    });

    this.publisher.on('error', (err) =>
      this.logger.error(`Redis publisher error: ${err.message}`),
    );
    this.subscriber.on('error', (err) =>
      this.logger.error(`Redis subscriber error: ${err.message}`),
    );
  }

  async publish(roomId: string, payload: unknown) {
    const channel = this.channel(roomId);
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  async subscribe(roomId: string, handler: (message: string) => void) {
    const channel = this.channel(roomId);
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      await this.subscriber.subscribe(channel);
    }
    set.add(handler);
  }

  async unsubscribe(roomId: string, handler: (message: string) => void) {
    const channel = this.channel(roomId);
    const set = this.handlers.get(channel);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
    }
  }

  private channel(roomId: string) {
    return `signaling:${roomId}`;
  }

  async onModuleDestroy() {
    await this.publisher.quit();
    await this.subscriber.quit();
  }
}
