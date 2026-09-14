import { answerInputSchema } from '../lib/server/answer-queue';
import { submitAnswer } from '../lib/server/answers';
import { GameFlowError } from '../lib/server/game-error';
import {
  heartbeatConnection,
  disconnectConnection,
} from '../lib/server/presence';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { z } from 'zod';
import {
  currentRealtimeIdentity,
  validateRealtimeSecret,
  verifyRealtimeTicket,
  type RealtimeIdentity,
} from '../lib/server/realtime-auth';
import {
  readPrivateSnapshot,
  readMonitorSnapshot,
} from '../lib/server/game-state';
import { dispatchGameEvents } from '../lib/server/event-dispatch';
import { parseGameEvent } from '../lib/realtime-schema';
import { db } from '../lib/server/db';

export const startRealtimeServer = async (options: {
  port: number;
  host?: string;
  redisUrl: string;
  origins: string[];
  prefix?: string;
}) => {
  validateRealtimeSecret();
  if (
    !options.origins.length ||
    options.origins.some(
      (origin) =>
        !/^https?:\/\//.test(origin) || new URL(origin).origin !== origin
    )
  )
    throw new Error('Configure exact ALLOWED_ORIGINS');
  const prefix = options.prefix || 'quiz:realtime:v1';
  const pub = createClient({
    url: options.redisUrl,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => Math.min(100 + retries * 100, 2000),
    },
  });
  const sub = pub.duplicate();
  const http = createServer((req, res) => {
    const healthy = pub.isReady && sub.isReady;
    res.writeHead(req.url === '/health' ? (healthy ? 200 : 503) : 404, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({ ok: req.url === '/health' && healthy }));
  });
  const io = new Server(http, {
    transports: ['websocket'],
    serveClient: false,
    maxHttpBufferSize: 16384,
    connectTimeout: 5000,
    cors: { origin: options.origins },
    allowRequest: (req, callback) =>
      callback(
        null,
        options.origins.includes(req.headers.origin || '') &&
          pub.isReady &&
          sub.isReady
      ),
  });
  // Stop clients on adapter outage: they must reconnect and synchronize after recovery.
  const unavailable = () => {
    for (const socket of io.of('/').sockets.values()) socket.disconnect(true);
  };
  pub.on('error', unavailable);
  sub.on('error', unavailable);
  pub.on('reconnecting', unavailable);
  sub.on('reconnecting', unavailable);
  try {
    await Promise.all([pub.connect(), sub.connect()]);
  } catch (error) {
    if (pub.isOpen) pub.destroy();
    if (sub.isOpen) sub.destroy();
    throw error;
  }
  const pending = new Set<Promise<unknown>>();
  const track = (task: Promise<unknown>) => {
    const handled = task.catch(() => undefined);
    pending.add(handled);
    void handled.then(() => pending.delete(handled));
  };
  io.adapter(createAdapter(pub, sub, { key: `${prefix}:adapter` }));
  const deliveries = new Map<string, Promise<void>>();
  await sub.subscribe(`${prefix}:events`, (message) => {
    try {
      const event = parseGameEvent(JSON.parse(message));
      const delivery = (deliveries.get(event.gameId) || Promise.resolve())
        .then(async () => {
          const ids = io.of('/').adapter.rooms.get(`game:${event.gameId}`);
          await Promise.all(
            [...(ids || [])].map(async (id) => {
              const socket = io.of('/').sockets.get(id);
              if (!socket) return;
              const identity = socket.data.identity as RealtimeIdentity;
              try {
                await currentRealtimeIdentity(
                  identity.sessionHash,
                  identity.gameId,
                  identity.role
                );
                if (socket.connected) socket.emit('GAME_EVENT', event);
              } catch {
                socket.disconnect(true);
              }
            })
          );
        })
        .catch(() => undefined);
      deliveries.set(event.gameId, delivery);
      void delivery.then(() => {
        if (deliveries.get(event.gameId) === delivery)
          deliveries.delete(event.gameId);
      });
    } catch {
      /* Invalid messages are never forwarded. */
    }
  });
  let dispatching: Promise<void> | undefined;
  const flushEvents = () => {
    if (!dispatching) {
      dispatching = dispatchGameEvents((event) => {
        if (!pub.isReady || !sub.isReady)
          throw new Error('REALTIME_UNAVAILABLE');
        return pub
          .withCommandOptions({ timeout: 1000 })
          .publish(`${prefix}:events`, JSON.stringify(event));
      }).finally(() => {
        dispatching = undefined;
      });
    }
    return dispatching;
  };
  const dispatcher = setInterval(() => {
    void flushEvents().catch(() =>
      console.error('Game event delivery failed; retrying')
    );
  }, 100);
  io.use(async (socket, next) => {
    try {
      const auth = z
        .object({ ticket: z.string().max(2048) })
        .strict()
        .parse(socket.handshake.auth);
      const verified = await verifyRealtimeTicket(
        auth.ticket,
        socket.handshake.headers.origin || ''
      );
      const accepted = await pub
        .withCommandOptions({ timeout: 1000 })
        .set(`${prefix}:ticket:${verified.nonce}`, 'used', {
          NX: true,
          PXAT: verified.expiresAt,
        });
      if (accepted !== 'OK') throw new Error('UNAUTHORIZED');
      if (verified.identity.role === 'player')
        await heartbeatConnection(
          socket.id,
          verified.identity.gameId,
          verified.identity.playerId
        );
      socket.data.identity = verified.identity;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });
  io.on('connection', (socket) => {
    const identity = socket.data.identity as RealtimeIdentity;
    void socket.join(`game:${identity.gameId}`);
    if (identity.role === 'player')
      void socket.join(`player:${identity.playerId}`);
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.min(identity.expiresAt - Date.now(), 2147483647)
    );
    let checking = false;
    let pendingHeartbeat: Promise<unknown> = Promise.resolve();
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        await currentRealtimeIdentity(
          identity.sessionHash,
          identity.gameId,
          identity.role
        );
        if (!socket.connected || identity.role === 'monitor') return;
        pendingHeartbeat = heartbeatConnection(
          socket.id,
          identity.gameId,
          identity.playerId
        );
        await pendingHeartbeat;
      } catch {
        socket.disconnect(true);
      } finally {
        checking = false;
      }
    };
    const guard = setInterval(() => {
      void check();
    }, 5000);
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      clearInterval(guard);
      if (identity.role === 'player')
        track(
          pendingHeartbeat
            .catch(() => undefined)
            .then(() =>
              disconnectConnection(
                socket.id,
                identity.gameId,
                identity.playerId
              )
            )
        );
    });
    let windowStart = Date.now();
    let events = 0;
    socket.onAny((event, ...args: unknown[]) => {
      if (Date.now() - windowStart >= 1000) {
        windowStart = Date.now();
        events = 0;
      }
      events++;
      if (events > 20) {
        socket.disconnect(true);
        return;
      }
      if (event !== 'SYNC_ROOM' && event !== 'SUBMIT_ANSWER') {
        const ack = args[args.length - 1];
        if (typeof ack === 'function') ack({ ok: false, code: 'BAD_REQUEST' });
        else socket.emit('PROTOCOL_ERROR', { code: 'BAD_REQUEST' });
      }
    });
    socket.on('SUBMIT_ANSWER', async (payload: unknown, ack: unknown) => {
      if (typeof ack !== 'function' || !socket.connected) return;
      if (identity.role === 'monitor') {
        ack({ ok: false, code: 'FORBIDDEN' });
        return;
      }
      const parsed = answerInputSchema
        .omit({ gameId: true })
        .safeParse(payload);
      if (!parsed.success) {
        ack({ ok: false, code: 'BAD_REQUEST' });
        return;
      }
      try {
        await currentRealtimeIdentity(
          identity.sessionHash,
          identity.gameId,
          identity.role
        );
        const receipt = await submitAnswer(identity.userId, {
          ...parsed.data,
          gameId: identity.gameId,
        });
        ack({ ok: true, receipt });
      } catch (error) {
        ack({
          ok: false,
          code:
            error instanceof GameFlowError
              ? error.reason
              : error instanceof Error && error.message === 'UNAUTHORIZED'
                ? 'UNAUTHORIZED'
                : 'UNAVAILABLE',
        });
      }
    });
    socket.on('SYNC_ROOM', async (payload: unknown, ack: unknown) => {
      if (typeof ack !== 'function' || !socket.connected) return;
      if (!z.object({}).strict().safeParse(payload).success) {
        ack({ ok: false, code: 'BAD_REQUEST' });
        return;
      }
      try {
        await currentRealtimeIdentity(
          identity.sessionHash,
          identity.gameId,
          identity.role
        );
        const state = await (
          identity.role === 'monitor'
            ? readMonitorSnapshot
            : readPrivateSnapshot
        )(identity.code, identity.userId);
        ack({ ok: true, state, serverTime: Date.now() });
      } catch {
        ack({ ok: false, code: 'UNAUTHORIZED' });
        socket.disconnect(true);
      }
    });
  });
  const close = async () => {
    clearInterval(dispatcher);
    await dispatching?.catch(() => undefined);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await Promise.all([...deliveries.values()]);
    await Promise.all([...pending]);
    if (sub.isOpen) await sub.close();
    if (pub.isOpen) await pub.close();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(options.port, options.host || '0.0.0.0', resolve);
    });
  } catch (error) {
    await close();
    throw error;
  }
  const address = http.address();
  if (!address || typeof address === 'string')
    throw new Error('No server address');
  return {
    port: address.port,
    flushEvents,
    // Trusted server API only; clients cannot select a broadcast room or payload.
    notifyRoom: async (gameId: string) => {
      if (!pub.isReady || !sub.isReady) throw new Error('REALTIME_UNAVAILABLE');
      const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
      io.to(`game:${gameId}`).emit('ROOM_UPDATED', { version: game.version });
    },
    close,
  };
};
