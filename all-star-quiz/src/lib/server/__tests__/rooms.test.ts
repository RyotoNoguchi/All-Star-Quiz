// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRoom, joinRoom, leaveRoom, readRoom } from '../rooms';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'quiz-rooms-'));
  vi.stubEnv('ROOM_STORE_PATH', join(directory, 'rooms.json'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
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
    await expect(readRoom(room.code, 'host')).rejects.toThrow('見つかりません');
  } finally {
    spy.mockRestore();
  }
});
