// @vitest-environment node
import { db } from '../db';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createRoom as createRoomAs,
  joinRoom as joinRoomAs,
  leaveRoom as leaveRoomAs,
  readRoom as readRoomAs,
} from '../rooms';

const actor = async (key: string) =>
  (
    await db.user.upsert({
      where: { tokenHash: key },
      update: { tokenHash: key },
      create: { tokenHash: key },
    })
  ).id;
const createRoom = async (name: unknown, key: string) =>
  createRoomAs(name, await actor(key));
const joinRoom = async (code: string, name: unknown, key: string) =>
  joinRoomAs(code, name, await actor(key));
const readRoom = async (code: string, key: string) =>
  readRoomAs(code, await actor(key));
const leaveRoom = async (code: string, key: string) =>
  leaveRoomAs(code, await actor(key));

if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_'))
  throw new Error('Run npm run test:db to isolate database tests.');
beforeEach(async () => {
  await db.game.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});

it('shares participants, restores membership and hides session tokens', async () => {
  const created = await createRoom('ホスト', 'secret-host');
  const joined = await joinRoom(created.room.code, 'ゲスト', 'secret-guest');
  expect(joined.room.players).toHaveLength(2);
  const restored = await readRoom(created.room.code, 'secret-host');
  expect(restored.playerId).toBe(created.playerId);
  expect(restored.room.players).toEqual(joined.room.players);
  expect(JSON.stringify(restored)).not.toContain('secret-');
  expect(
    (await joinRoom(created.room.code, 'ゲスト', 'secret-guest')).room.players
  ).toHaveLength(2);
});
it('validates names, unknown codes and member access', async () => {
  await expect(createRoom('  ', 'host')).rejects.toThrow('名前');
  await expect(createRoom('a'.repeat(21), 'host')).rejects.toThrow('名前');
  await expect(joinRoom('ABCDEF', 'ゲスト', 'guest')).rejects.toThrow(
    '見つかりません'
  );
  const { room } = await createRoom('ホスト', 'host');
  await expect(readRoom(room.code, 'stranger')).rejects.toThrow(
    '参加してください'
  );
  await expect(joinRoom(room.code, ' ホスト ', 'guest')).rejects.toThrow(
    '使用されています'
  );
});
it('serializes simultaneous joins and enforces the player limit', async () => {
  const { room } = await createRoom('ホスト', 'host');
  const results = await Promise.allSettled(
    Array.from({ length: 25 }, (_, i) =>
      joinRoom(room.code, `参加者${i}`, `token${i}`)
    )
  );
  expect(
    results.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(19);
  expect((await readRoom(room.code, 'host')).room.players).toHaveLength(20);
});
it('transfers host on departure and deletes empty rooms', async () => {
  const { room } = await createRoom('ホスト', 'host');
  await joinRoom(room.code, 'ゲスト', 'guest');
  await expect(leaveRoom(room.code, 'outsider')).rejects.toThrow(
    '参加してください'
  );
  await leaveRoom(room.code, 'host');
  expect((await readRoom(room.code, 'guest')).room.players[0]?.isHost).toBe(
    true
  );
  await leaveRoom(room.code, 'guest');
  await expect(readRoom(room.code, 'guest')).rejects.toThrow('見つかりません');
});
it('expires rooms after 24 hours', async () => {
  const { room } = await createRoom('ホスト', 'host');
  const spy = vi.spyOn(Date, 'now').mockReturnValue(room.createdAt + 86400001);
  try {
    await expect(readRoom(room.code, 'host')).rejects.toThrow('有効期限');
    expect(
      (await db.game.findUnique({ where: { code: room.code } }))?.finishReason
    ).toBe('expired');
  } finally {
    spy.mockRestore();
  }
});

it('shares data across independent processes and survives client restart', async () => {
  const created = await createRoom('ホスト', 'host');
  const run = promisify(execFile);
  const join = (token: string) =>
    run(process.execPath, [
      '--import',
      'tsx',
      'scripts/room-worker.ts',
      'join',
      created.room.code,
      token,
    ]);
  await Promise.all([join('worker-a'), join('worker-b')]);
  expect((await readRoom(created.room.code, 'host')).room.players).toHaveLength(
    20
  );
  await db.$disconnect();
  const restarted = await run(process.execPath, [
    '--import',
    'tsx',
    'scripts/room-worker.ts',
    'read',
    created.room.code,
    'host',
  ]);
  expect(JSON.parse(restarted.stdout).playerId).toBe(created.playerId);
  expect(JSON.parse(restarted.stdout).room.players).toHaveLength(20);
});
it('serializes duplicate names and identities', async () => {
  const { room } = await createRoom('ホスト', 'host');
  const duplicate = await Promise.allSettled([
    joinRoom(room.code, '同名', 'a'),
    joinRoom(room.code, '同名', 'b'),
  ]);
  expect(
    duplicate.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(1);
  await Promise.all([
    joinRoom(room.code, '同じ人', 'same'),
    joinRoom(room.code, '同じ人', 'same'),
  ]);
  expect((await readRoom(room.code, 'host')).room.players).toHaveLength(3);
});
