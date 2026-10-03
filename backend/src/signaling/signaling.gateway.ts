import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { NvrsService } from '../nvrs/nvrs.service';
import { JwtPayload } from '../auth/auth.types';
import { SignalingRedisService } from './signaling-redis.service';

type PeerRole = 'simulator' | 'viewer';

interface RoomPeer {
  socketId: string;
  userId: string;
  role: PeerRole;
  polite: boolean;
}

interface ClientState {
  userId: string;
  organizationId: string;
  email: string;
  role: 'admin' | 'member';
  roomId?: string;
  nvrId?: string;
  peerRole?: PeerRole;
  redisHandler?: (message: string) => void;
}

@WebSocketGateway({
  path: '/signaling',
  cors: { origin: true, credentials: true },
})
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SignalingGateway.name);
  private readonly clients = new Map<string, ClientState>();
  private readonly rooms = new Map<string, Map<string, RoomPeer>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly nvrs: NvrsService,
    private readonly redis: SignalingRedisService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);
      if (!token) {
        client.emit('error', { message: 'Missing auth token' });
        client.disconnect(true);
        return;
      }
      const payload = this.jwt.verify<JwtPayload>(token);
      this.clients.set(client.id, {
        userId: payload.sub,
        organizationId: payload.organizationId,
        email: payload.email,
        role: payload.role,
      });
      this.logger.log(`WS connected ${payload.email} (${client.id})`);
    } catch {
      client.emit('error', { message: 'Invalid auth token' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    await this.leaveRoom(client);
    this.clients.delete(client.id);
    this.logger.log(`WS disconnected ${client.id}`);
  }

  @SubscribeMessage('join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { nvrId?: string; role?: PeerRole },
  ) {
    const state = this.clients.get(client.id);
    if (!state) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const nvrId = body?.nvrId;
    const peerRole = body?.role;
    if (!nvrId || (peerRole !== 'simulator' && peerRole !== 'viewer')) {
      client.emit('error', {
        message: 'join requires nvrId and role (simulator|viewer)',
      });
      return;
    }

    let nvr;
    try {
      nvr = await this.nvrs.getForOrg(nvrId, state.organizationId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to access NVR';
      client.emit('error', { message });
      return;
    }

    const roomId = `${state.organizationId}:${nvr.id}`;
    if (state.roomId) {
      await this.leaveRoom(client);
    }

    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }

    for (const peer of room.values()) {
      if (peer.role === peerRole) {
        client.emit('error', {
          message: `Room already has a ${peerRole}`,
        });
        return;
      }
    }
    if (room.size >= 2) {
      client.emit('error', { message: 'Room full' });
      return;
    }

    // Simulator is impolite publisher; viewer is polite consumer.
    const polite = peerRole === 'viewer';
    const peer: RoomPeer = {
      socketId: client.id,
      userId: state.userId,
      role: peerRole,
      polite,
    };
    room.set(client.id, peer);

    state.roomId = roomId;
    state.nvrId = nvr.id;
    state.peerRole = peerRole;

    const redisHandler = (raw: string) => {
      try {
        const msg = JSON.parse(raw) as {
          from: string;
          event: string;
          data: unknown;
        };
        if (msg.from === client.id) return;
        client.emit(msg.event, msg.data);
      } catch {
        // ignore malformed fanout
      }
    };
    state.redisHandler = redisHandler;
    await this.redis.subscribe(roomId, redisHandler);

    if (peerRole === 'simulator') {
      await this.nvrs.setStatus(nvr.id, 'online');
    }

    const peers = [...room.values()]
      .filter((p) => p.socketId !== client.id)
      .map((p) => ({ role: p.role, polite: p.polite }));

    client.emit('welcome', {
      roomId,
      nvrId: nvr.id,
      role: peerRole,
      polite,
      peers,
    });

    await this.redis.publish(roomId, {
      from: client.id,
      event: 'peer-joined',
      data: { role: peerRole, polite },
    });

    this.logger.log(
      `${state.email} joined ${roomId} as ${peerRole} (polite=${polite})`,
    );
  }

  @SubscribeMessage('description')
  async onDescription(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ) {
    await this.relay(client, 'description', data);
  }

  @SubscribeMessage('ice')
  async onIce(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ) {
    await this.relay(client, 'ice', data);
  }

  private async relay(client: Socket, event: string, data: unknown) {
    const state = this.clients.get(client.id);
    if (!state?.roomId) {
      client.emit('error', { message: 'Not in a room' });
      return;
    }
    // Fanout via Redis so same-process and multi-instance peers both receive once.
    await this.redis.publish(state.roomId, {
      from: client.id,
      event,
      data,
    });
  }

  private async leaveRoom(client: Socket) {
    const state = this.clients.get(client.id);
    if (!state?.roomId) return;

    const roomId = state.roomId;
    const room = this.rooms.get(roomId);
    const peer = room?.get(client.id);

    if (state.redisHandler) {
      await this.redis.unsubscribe(roomId, state.redisHandler);
      state.redisHandler = undefined;
    }

    room?.delete(client.id);
    if (room && room.size === 0) {
      this.rooms.delete(roomId);
    }

    if (peer?.role === 'simulator' && state.nvrId) {
      await this.nvrs.setStatus(state.nvrId, 'offline');
    }

    await this.redis.publish(roomId, {
      from: client.id,
      event: 'peer-left',
      data: { role: peer?.role },
    });

    state.roomId = undefined;
    state.nvrId = undefined;
    state.peerRole = undefined;
  }
}
