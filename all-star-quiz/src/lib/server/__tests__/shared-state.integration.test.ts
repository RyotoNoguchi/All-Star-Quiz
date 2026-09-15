import { spawn } from 'node:child_process';
import { createClient } from 'redis';
import { createSharedStore, closeSharedStore } from '../shared-state';
import { createGuestSession } from '../session';
import { createRoom, readRoom, joinRoom } from '../rooms';
import { db } from '../db';
if (
  !process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_') ||
  !process.env.REDIS_URL ||
  !process.env.QUIZ_REDIS_PREFIX?.startsWith('quiz_test_')
)
  throw new Error('Use test:db with TEST_REDIS_URL');
const url = process.env.REDIS_URL;
const prefix = process.env.QUIZ_REDIS_PREFIX;
const store = createSharedStore(url, prefix);
const client = createClient({ url });
client.on('error', () => {});
const room = {
  code: 'ABCDEF',
  phase: 'waiting' as const,
  createdAt: 1,
  players: [{ id: 'p', name: '名前', isHost: true }],
};
const worker = (mode: string, gameId: string) =>
  new Promise<unknown>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/shared-state-worker.ts', mode, gameId],
      { env: process.env }
    );
    let result = '';
    let errors = '';
    child.stdout.on('data', (data) => {
      result += data;
    });
    child.stderr.on('data', (data) => {
      errors += data;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(JSON.parse(result));
      else reject(new Error(errors));
    });
  });
beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  store.close();
  closeSharedStore();
  const keys = await client.keys(`${prefix}:*`);
  if (keys.length) await client.del(keys);
  client.destroy();
  await db.$disconnect();
});
it('shares state across processes and rejects stale overwrites atomically', async () => {
  expect(await store.write('versions', 2, room, Date.now() + 60000)).toBe(true);
  expect(
    await store.write(
      'versions',
      1,
      { ...room, players: [] },
      Date.now() + 60000
    )
  ).toBe(false);
  expect(await worker('read', 'versions')).toEqual(room);
  expect(await store.read('versions', 3)).toBeNull();
});
it('allows one lease owner across processes and never releases a different owner', async () => {
  const results = await Promise.all([
    worker('acquire', 'lease'),
    worker('acquire', 'lease'),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await store.release('lease', 'forged')).toBe(false);
  expect(await store.acquire('lease')).toBeNull();
  expect(await store.release('lease', results.find(Boolean) as string)).toBe(
    true
  );
});
it('expires state and leases and protects a new owner from a delayed release', async () => {
  await store.write('expiry', 0, room, Date.now() + 80);
  const old = await store.acquire('expiry', 80);
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(await store.read('expiry', 0)).toBeNull();
  const next = await store.acquire('expiry');
  expect(next).toBeTruthy();
  expect(await store.release('expiry', old!)).toBe(false);
  expect(await store.acquire('expiry')).toBeNull();
  expect(await store.release('expiry', next!)).toBe(true);
  expect(await store.write('expired', 0, room, Date.now() - 1)).toBe(false);
});
it('reconnects after closing a connection and reconstructs a lost cache from the database', async () => {
  const guest = await createGuestSession();
  const created = await createRoom('共有ホスト', guest.userId);
  const game = await db.game.findUniqueOrThrow({
    where: { code: created.room.code },
  });
  expect(await readRoom(game.code, guest.userId)).toEqual(created);
  expect(await store.read(game.id, 0)).toEqual(created.room);
  store.close();
  expect(await store.read(game.id, 0)).toEqual(created.room);
  await client.del(`${prefix}:{${game.id}}:state`);
  expect(await readRoom(game.code, guest.userId)).toEqual(created);
  const other = await createGuestSession();
  await joinRoom(game.code, '追加参加者', other.userId);
  expect((await readRoom(game.code, guest.userId)).room.players).toHaveLength(
    2
  );
  expect(await store.read(game.id, 0)).toBeNull();
  await expect(
    readRoom(game.code, (await createGuestSession()).userId)
  ).rejects.toMatchObject({ status: 403 });
});
it('falls back to authoritative room data when Redis is unavailable', async () => {
  closeSharedStore();
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  try {
    const guest = await createGuestSession();
    const created = await createRoom('障害時ホスト', guest.userId);
    expect(await readRoom(created.room.code, guest.userId)).toEqual(created);
  } finally {
    closeSharedStore();
    process.env.REDIS_URL = url;
  }
});
it('allows only one audio owner across clients, renews it, and ignores another owner release', async () => {
  const other = createSharedStore(url, prefix);
  try {
    expect(await store.claimAudio('audio-test', 'first')).toBe(true);
    expect(await other.claimAudio('audio-test', 'second')).toBe(false);
    expect(await store.claimAudio('audio-test', 'first')).toBe(true);
    expect(await other.releaseAudio('audio-test', 'second')).toBe(false);
    expect(await store.releaseAudio('audio-test', 'first')).toBe(true);
    expect(await other.claimAudio('audio-test', 'second')).toBe(true);
    await client.pExpire(`${prefix}:{audio-test}:audio`, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await store.claimAudio('audio-test', 'first')).toBe(true);
  } finally {
    other.close();
  }
});
