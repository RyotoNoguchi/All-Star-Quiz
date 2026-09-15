import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { db } from '../db';
import { createGuestSession, revokeSession } from '../session';
import { createRoom, joinRoom } from '../rooms';
import { persistGameResult } from '../game-results';
import { runHostCommand } from '../game-flow';
import { appRouter } from '../api/router';
import { createContext } from '../api/context';
import { closeSharedStore } from '../shared-state';
if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_'))
  throw new Error('Use test:db');
const caller = async (token: string) =>
  appRouter.createCaller(
    await createContext(
      new NextRequest('http://localhost:3000/api/trpc', {
        headers: {
          origin: 'http://localhost:3000',
          cookie: `quiz-participant=${token}`,
        },
      }),
      new Headers()
    )
  );
beforeEach(async () => {
  await db.game.deleteMany();
  await db.question.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  closeSharedStore();
  await db.$disconnect();
});
const setup = async () => {
  const host = await createGuestSession();
  const other = await createGuestSession();
  const room = await createRoom('履歴ホスト', host.userId);
  await joinRoom(room.room.code, '履歴参加者', other.userId);
  const game = await db.game.findUniqueOrThrow({
    where: { code: room.room.code },
  });
  return { host, other, room, game };
};
it('rolls back history with failed completion, retries once, and restores from a fresh client', async () => {
  const { host, game } = await setup();
  await expect(
    db.$transaction(async (tx) => {
      const ended = await tx.game.update({
        where: { id: game.id },
        data: {
          phase: 'finished',
          finishReason: 'cancelled',
          version: { increment: 1 },
        },
      });
      await persistGameResult(tx, ended);
      throw new Error('Simulated commit failure');
    })
  ).rejects.toThrow('Simulated commit failure');
  expect(await db.personalResult.count()).toBe(0);
  expect(await db.gameResult.count()).toBe(0);
  expect(
    (await db.game.findUniqueOrThrow({ where: { id: game.id } })).phase
  ).toBe('waiting');
  const command = {
    gameId: game.id,
    action: 'cancel' as const,
    requestId: randomUUID(),
    expectedVersion: game.version,
  };
  await runHostCommand(host.userId, command);
  await runHostCommand(host.userId, command);
  expect(await db.personalResult.count()).toBe(2);
  const restarted = new PrismaClient();
  try {
    expect(
      await restarted.personalResult.findUnique({
        where: { gameId_userId: { gameId: game.id, userId: host.userId } },
      })
    ).toMatchObject({
      playerName: '履歴ホスト',
      rank: 1,
      survivedQuestions: 0,
      isWinner: false,
      reason: 'cancelled',
    });
  } finally {
    await restarted.$disconnect();
  }
});
it('returns only personal records, denies foreign detail and revoked sessions, and hides unpublished questions', async () => {
  const { host, other, game } = await setup();
  const fields = {
    question: '未公開の秘密',
    choices: { A: '一', B: '二', C: '三', D: '四' },
    answer: 'A' as const,
    type: 'final' as const,
    timeLimit: 10,
    choiceImages: {},
    category: null,
    explanation: '秘密の解説',
  };
  const q = await db.question.create({ data: fields });
  await db.gameQuestion.create({
    data: {
      gameId: game.id,
      questionId: q.id,
      position: 0,
      snapshot: { ...fields, id: q.id, version: 0 },
    },
  });
  await runHostCommand(host.userId, {
    gameId: game.id,
    action: 'cancel',
    requestId: randomUUID(),
    expectedVersion: game.version,
  });
  const api = await caller(host.token);
  const list = await api.history.list({});
  expect(list.total).toBe(1);
  expect(list.items[0]?.playerName).toBe('履歴ホスト');
  expect(JSON.stringify(list)).not.toContain(other.userId);
  expect((await api.history.detail({ gameId: game.id })).questions).toEqual([]);
  const stranger = await createGuestSession();
  expect((await (await caller(stranger.token)).history.list({})).items).toEqual(
    []
  );
  await expect(
    (await caller(stranger.token)).history.detail({ gameId: game.id })
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await db.participant.updateMany({
    where: { userId: host.userId },
    data: { name: '後で変更' },
  });
  expect((await api.history.list({})).items[0]?.playerName).toBe('履歴ホスト');
  await revokeSession(host.token);
  await expect(
    (await caller(host.token)).history.list({})
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
it('backfills existing finished games without changing saved ranking', async () => {
  const { host, game } = await setup();
  await runHostCommand(host.userId, {
    gameId: game.id,
    action: 'cancel',
    requestId: randomUUID(),
    expectedVersion: game.version,
  });
  const saved = await db.personalResult.findMany({
    orderBy: { userId: 'asc' },
  });
  await db.personalResult.deleteMany();
  const migration = await readFile(
    'prisma/migrations/20260915173000_personal_history/migration.sql',
    'utf8'
  );
  await db.$executeRawUnsafe(migration.slice(migration.indexOf('INSERT INTO')));
  expect(
    await db.personalResult.findMany({ orderBy: { userId: 'asc' } })
  ).toEqual(saved);
});
it('aggregates all personal games independently of pagination and other players', async () => {
  const host = await createGuestSession();
  const other = await createGuestSession();
  for (const [i, survivedQuestions] of [0, 2, 5].entries()) {
    const room = await createRoom('成績', host.userId);
    await joinRoom(room.room.code, '別人', other.userId);
    const game = await db.game.findUniqueOrThrow({
      where: { code: room.room.code },
    });
    await runHostCommand(host.userId, {
      gameId: game.id,
      action: 'cancel',
      requestId: randomUUID(),
      expectedVersion: game.version,
    });
    await db.personalResult.update({
      where: { gameId_userId: { gameId: game.id, userId: host.userId } },
      data: { survivedQuestions, isWinner: i === 2 },
    });
    await db.personalResult.update({
      where: { gameId_userId: { gameId: game.id, userId: other.userId } },
      data: { survivedQuestions: 50, isWinner: true },
    });
  }
  const api = await caller(host.token);
  expect((await api.history.list({ limit: 1 })).items).toHaveLength(1);
  expect(await api.history.stats()).toEqual({
    games: 3,
    wins: 1,
    averageSurvived: 7 / 3,
    bestSurvived: 5,
  });
  const stranger = await createGuestSession();
  expect(await (await caller(stranger.token)).history.stats()).toEqual({
    games: 0,
    wins: 0,
    averageSurvived: 0,
    bestSurvived: 0,
  });
  await revokeSession(host.token);
  await expect(
    (await caller(host.token)).history.stats()
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
