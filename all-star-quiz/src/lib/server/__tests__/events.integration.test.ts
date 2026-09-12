import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { createGuestSession } from '../session';
import { createRoom, joinRoom } from '../rooms';
import { runHostCommand, leaveStartedGame } from '../game-flow';
import { submitAnswer } from '../answers';
import { maintainGame } from '../presence';
import { readPrivateSnapshot } from '../game-state';
import { dispatchGameEvents } from '../event-dispatch';
import { parseGameEvent } from '../../realtime-schema';
if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_'))
  throw new Error('Use test:db');
beforeEach(async () => {
  await db.game.deleteMany();
  await db.question.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});
const setup = async () => {
  const host = await createGuestSession();
  const peer = await createGuestSession();
  const room = await createRoom('ホスト', host.userId);
  await joinRoom(room.room.code, '参加者', peer.userId);
  const game = await db.game.findUniqueOrThrow({
    where: { code: room.room.code },
  });
  const fields = {
    question: '秘密の最終問題',
    choices: { A: '一', B: '二', C: '三', D: '四' },
    answer: 'A' as const,
    type: 'final' as const,
    timeLimit: 10,
    choiceImages: {},
    category: null,
    explanation: '未公開の解説',
  };
  const question = await db.question.create({ data: fields });
  await db.gameQuestion.create({
    data: {
      gameId: game.id,
      questionId: question.id,
      position: 0,
      snapshot: { ...fields, id: question.id, version: 0 },
    },
  });
  await runHostCommand(host.userId, {
    gameId: game.id,
    requestId: randomUUID(),
    expectedVersion: game.version,
    action: 'start',
  });
  return { host, peer, game, question };
};
it('provides only own receipt before results, then complete results, with contiguous public versions', async () => {
  const { host, peer, game, question } = await setup();
  const receipt = await submitAnswer(host.userId, {
    gameId: game.id,
    questionId: question.id,
    requestId: randomUUID(),
    choice: 'A',
  });
  const own = await readPrivateSnapshot(game.code, host.userId);
  const other = await readPrivateSnapshot(game.code, peer.userId);
  expect(own.ownAnswer).toEqual(receipt);
  expect(other).not.toHaveProperty('ownAnswer');
  expect(other.question).not.toHaveProperty('answer');
  expect(other.question).not.toHaveProperty('type');
  expect(JSON.stringify(other)).not.toContain('未公開の解説');
  expect(other).not.toHaveProperty('result');
  await expect(
    readPrivateSnapshot(game.code, (await createGuestSession()).userId)
  ).rejects.toMatchObject({ reason: 'FORBIDDEN' });
  await submitAnswer(peer.userId, {
    gameId: game.id,
    questionId: question.id,
    requestId: randomUUID(),
    choice: 'B',
  });
  await maintainGame(game.id);
  const finished = await readPrivateSnapshot(game.code, peer.userId);
  expect(finished.phase).toBe('finished');
  expect(finished.lastResult).toMatchObject({
    isFinal: true,
    correctAnswer: 'A',
  });
  expect(finished.result?.finalRanking).toHaveLength(2);
  const events = await db.gameEventRecord.findMany({
    where: { gameId: game.id },
    orderBy: { version: 'asc' },
  });
  expect(events.map((e) => e.version)).toEqual(
    Array.from({ length: finished.version + 1 }, (_, i) => i)
  );
  expect(events.map((e) => e.type)).toEqual([
    'STATE_SYNC',
    'STATE_SYNC',
    'QUESTION_STARTED',
    'ANSWER_COUNT_UPDATED',
    'ANSWER_COUNT_UPDATED',
    'QUESTION_CLOSED',
    'QUESTION_ENDED',
    'GAME_ENDED',
  ]);
  for (const e of events)
    expect(() =>
      parseGameEvent({ ...e, eventId: e.id, serverTime: e.createdAt.getTime() })
    ).not.toThrow();
});
it('retains failed outbox records and serializes concurrent dispatchers by game version', async () => {
  const { game } = await setup();
  await expect(
    dispatchGameEvents(async () => {
      throw new Error('Redis unavailable');
    })
  ).rejects.toThrow('Redis unavailable');
  expect(
    await db.gameEventRecord.count({ where: { publishedAt: { not: null } } })
  ).toBe(0);
  const versions: number[] = [];
  const publish = async (event: { version: number }) => {
    versions.push(event.version);
    await new Promise((resolve) => setTimeout(resolve, 10));
  };
  await Promise.all([dispatchGameEvents(publish), dispatchGameEvents(publish)]);
  expect(versions).toEqual([0, 1, 2]);
  expect(
    await db.gameEventRecord.count({
      where: { gameId: game.id, publishedAt: null },
    })
  ).toBe(0);
  await dispatchGameEvents(publish);
  expect(versions).toEqual([0, 1, 2]);
});
it('denies a departed participant access to the current snapshot', async () => {
  const { game, peer } = await setup();
  await leaveStartedGame(game.id, peer.userId);
  await expect(
    readPrivateSnapshot(game.code, peer.userId)
  ).rejects.toMatchObject({ reason: 'FORBIDDEN' });
});
