import { randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { z } from 'zod';
import type { RoomView } from '@/types/room';

const roomSchema = z
  .object({
    code: z.string(),
    phase: z.literal('waiting'),
    createdAt: z.number(),
    players: z.array(
      z
        .object({ id: z.string(), name: z.string(), isHost: z.boolean() })
        .strict()
    ),
  })
  .strict();
const stateSchema = z
  .object({ version: z.number().int().nonnegative(), room: roomSchema })
  .strict();
const WRITE_STATE = `
local current = redis.call('GET', KEYS[1])
if current then
  local ok, state = pcall(cjson.decode, current)
  if ok and type(state) == 'table' and tonumber(state.version) and tonumber(state.version) > tonumber(ARGV[1]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[2], 'PXAT', ARGV[3])
return 1`;
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

// Redis is an expendable cache / coordination aid. Authoritative writes still use DB row locks.
export const createSharedStore = (url: string, prefix = 'quiz:v1') => {
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 1000, reconnectStrategy: false },
  });
  client.on('error', () => {
    /* Callers handle failures; never log credentials/URL. */
  });
  let connecting: Promise<unknown> | undefined;
  const ready = async () => {
    if (!client.isReady) {
      connecting ??= client.connect().finally(() => {
        connecting = undefined;
      });
      await connecting;
    }
    return client.withCommandOptions({ timeout: 1000 });
  };
  const key = (gameId: string, kind: string) => `${prefix}:{${gameId}}:${kind}`;
  return {
    read: async (gameId: string, version: number) => {
      const raw = await (await ready()).get(key(gameId, 'state'));
      if (!raw) return null;
      try {
        const value = stateSchema.parse(JSON.parse(raw));
        return value.version === version ? value.room : null;
      } catch {
        return null;
      }
    },
    write: async (
      gameId: string,
      version: number,
      room: RoomView['room'],
      expiresAt: number
    ) => {
      const expiry = Math.min(Date.now() + 60000, expiresAt);
      if (expiry <= Date.now()) return false;
      const state = stateSchema.parse({ version, room });
      return (
        (await (
          await ready()
        ).eval(WRITE_STATE, {
          keys: [key(gameId, 'state')],
          arguments: [String(version), JSON.stringify(state), String(expiry)],
        })) === 1
      );
    },
    acquire: async (gameId: string, ttlMs = 5000) => {
      if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 30000)
        throw new Error('Invalid lease TTL');
      const token = randomBytes(32).toString('hex');
      return (await (
        await ready()
      ).set(key(gameId, 'lease'), token, { NX: true, PX: ttlMs })) === 'OK'
        ? token
        : null;
    },
    release: async (gameId: string, token: string) =>
      (await (
        await ready()
      ).eval(RELEASE, { keys: [key(gameId, 'lease')], arguments: [token] })) ===
      1,
    claimAudio: async (gameId: string, owner: string) =>
      (await (
        await ready()
      ).eval(
        `local current = redis.call('GET', KEYS[1])
if not current or current == ARGV[1] then redis.call('SET', KEYS[1], ARGV[1], 'PX', 10000); return 1 end
return 0`,
        { keys: [key(gameId, 'audio')], arguments: [owner] }
      )) === 1,
    releaseAudio: async (gameId: string, owner: string) =>
      (await (
        await ready()
      ).eval(RELEASE, { keys: [key(gameId, 'audio')], arguments: [owner] })) ===
      1,
    close: () => {
      if (client.isOpen) client.destroy();
    },
  };
};
let store: ReturnType<typeof createSharedStore> | undefined;
export const sharedRoom = async (
  gameId: string,
  version: number,
  room: RoomView['room'],
  expiresAt: number
) => {
  if (!process.env.REDIS_URL || expiresAt <= Date.now()) return room;
  store ??= createSharedStore(
    process.env.REDIS_URL,
    process.env.QUIZ_REDIS_PREFIX || 'quiz:v1'
  );
  try {
    const cached = await store.read(gameId, version);
    if (cached) return cached;
    await store.write(gameId, version, room, expiresAt);
  } catch {
    // Membership / game version were already checked against PostgreSQL by the caller.
    // A cache outage must not invalidate an otherwise valid DB-backed lobby response.
  }
  return room;
};
export const closeSharedStore = () => {
  store?.close();
  store = undefined;
};

export const audioLease = async (
  gameId: string,
  owner: string,
  release: boolean
) => {
  if (!process.env.REDIS_URL) throw new Error('Audio coordination unavailable');
  store ??= createSharedStore(
    process.env.REDIS_URL,
    process.env.QUIZ_REDIS_PREFIX || 'quiz:v1'
  );
  if (release) {
    await store.releaseAudio(gameId, owner);
    return false;
  }
  return store.claimAudio(gameId, owner);
};
