import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { appRouter } from '../api/router';
import { createContext } from '../api/context';
import { db } from '../db';
import { createGuestSession } from '../session';
import { createRoom, joinRoom } from '../rooms';
import {
  runHostCommand,
  withGame,
  closeQuestionIfReady,
  leaveStartedGame,
  readGameProgress,
} from '../game-flow';
import { enqueueAnswer } from '../answer-queue';
import { maintainGame } from '../presence';
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
const setup = async (count: number, normal = false) => {
  const users = await Promise.all(
    Array.from({ length: count }, () => createGuestSession())
  );
  const room = await createRoom('ホスト', users[0]!.userId);
  for (const [i, user] of users.slice(1).entries())
    await joinRoom(room.room.code, `参加者${i}`, user.userId);
  const game = await db.game.findUniqueOrThrow({
    where: { code: room.room.code },
    include: { participants: { orderBy: { joinedOrder: 'asc' } } },
  });
  const types: ('normal' | 'final')[] = normal
    ? ['normal', 'final']
    : ['final'];
  for (const [position, type] of types.entries()) {
    const fields = {
      question: '問題',
      choices: { A: '一', B: '二', C: '三', D: '四' },
      answer: 'A' as const,
      type,
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
        position,
        snapshot: { ...fields, id: q.id, version: 0 },
      },
    });
  }
  await runHostCommand(users[0]!.userId, {
    gameId: game.id,
    action: 'start',
    expectedVersion: game.version,
    requestId: randomUUID(),
  });
  return { game, users };
};
type Setup = Awaited<ReturnType<typeof setup>>;
const answerRound = async (
  { game, users }: Setup,
  answers: ({ choice: 'A' | 'B'; time: number } | null)[]
) => {
  const current = await db.game.findUniqueOrThrow({ where: { id: game.id } });
  const question = await db.gameQuestion.findFirstOrThrow({
    where: { gameId: game.id, position: current.currentQuestionIndex },
  });
  for (const [i, answer] of answers.entries()) {
    if (!answer) continue;
    const queued = await enqueueAnswer(users[i]!.userId, {
      gameId: game.id,
      questionId: question.questionId,
      requestId: randomUUID(),
      choice: answer.choice,
    });
    await db.answerSubmission.update({
      where: { id: queued.id },
      data: {
        receivedAt: new Date(current.startedAt!.getTime() + answer.time),
      },
    });
  }
  await withGame(game.id, closeQuestionIfReady);
};
const finishRound = async (gameId: string) => {
  await db.game.update({
    where: { id: gameId },
    data: { deadlineAt: new Date(0) },
  });
  return maintainGame(gameId);
};
it('persists one winner and distinct result/end events only after revealing the final question', async () => {
  const fixture = await setup(3);
  const { game, users } = fixture;
  expect(
    await db.gameEventRecord.count({
      where: { type: { in: ['QUESTION_ENDED', 'GAME_ENDED'] } },
    })
  ).toBe(0);
  expect(
    await readGameProgress(game.code, users[0]!.userId)
  ).not.toHaveProperty('isFinal');
  await answerRound(fixture, [
    { choice: 'A', time: 200 },
    { choice: 'A', time: 100 },
    { choice: 'A', time: 100 },
  ]);
  const [first, second] = await Promise.all([
    maintainGame(game.id),
    maintainGame(game.id),
  ]);
  expect(first.phase).toBe('finished');
  expect(second.version).toBe(first.version);
  const result = await db.gameResult.findUniqueOrThrow({
    where: { gameId: game.id },
  });
  expect(result.winnerId).toBe(game.participants[1]!.id);
  expect(result.ranking).toEqual([
    { playerId: game.participants[1]!.id, rank: 1, survivedQuestions: 1 },
    { playerId: game.participants[0]!.id, rank: 2, survivedQuestions: 1 },
    { playerId: game.participants[2]!.id, rank: 2, survivedQuestions: 1 },
  ]);
  expect(
    await db.participant.count({
      where: { gameId: game.id, isEliminated: true },
    })
  ).toBe(0);
  const events = await db.gameEventRecord.findMany({
    where: { gameId: game.id, type: { in: ['QUESTION_ENDED', 'GAME_ENDED'] } },
    orderBy: { version: 'asc' },
  });
  expect(events.map((event) => event.type)).toEqual([
    'QUESTION_ENDED',
    'GAME_ENDED',
  ]);
  expect(events[0]!.payload).toMatchObject({
    isFinal: true,
    winnerId: result.winnerId,
  });
  expect(events[1]!.version).toBe(events[0]!.version + 1);
  expect(events[1]!.payload).toMatchObject({
    result: { winnerId: result.winnerId },
    lastResult: { isFinal: true },
  });
  await maintainGame(game.id);
  expect(
    await db.gameResult.findUnique({ where: { gameId: game.id } })
  ).toEqual(result);
  expect(
    await db.gameEventRecord.count({
      where: {
        gameId: game.id,
        type: { in: ['QUESTION_ENDED', 'GAME_ENDED'] },
      },
    })
  ).toBe(2);
});
it('ranks later elimination above earlier elimination and preserves equal ranks and survival counts', async () => {
  const fixture = await setup(5, true);
  const { game, users } = fixture;
  await answerRound(
    fixture,
    [100, 200, 300, 400, 500].map((time) => ({ choice: 'A', time }))
  );
  const normal = await maintainGame(game.id);
  expect(normal.phase).toBe('results');
  await runHostCommand(users[0]!.userId, {
    gameId: game.id,
    action: 'next',
    expectedVersion: normal.version,
    requestId: randomUUID(),
  });
  await answerRound(fixture, [
    { choice: 'A', time: 100 },
    { choice: 'A', time: 200 },
    { choice: 'B', time: 300 },
    null,
    null,
  ]);
  await finishRound(game.id);
  const result = await db.gameResult.findUniqueOrThrow({
    where: { gameId: game.id },
  });
  expect(result.ranking).toEqual(
    game.participants.map((p, i) => ({
      playerId: p.id,
      rank: [1, 2, 3, 3, 5][i],
      survivedQuestions: [2, 2, 1, 1, 0][i],
    }))
  );
  expect(result.totalQuestions).toBe(2);
  expect(result.statistics).toMatchObject({ totalPlayers: 5, totalAnswers: 8 });
  for (const [i, user] of users.entries()) {
    const api = appRouter.createCaller(
      await createContext(
        new NextRequest('http://localhost:3000/api/trpc', {
          headers: { cookie: `quiz-participant=${user.token}` },
        }),
        new Headers()
      )
    );
    const history = await api.history.detail({ gameId: game.id });
    expect(history.result).toMatchObject({
      rank: [1, 2, 3, 3, 5][i],
      survivedQuestions: [2, 2, 1, 1, 0][i],
      isWinner: i === 0,
      eliminatedAtQuestion: [null, null, 2, 2, 1][i],
      eliminationReason: [null, null, 'wrong', 'timeout', 'slowest'][i],
    });
    expect(history.questions).toHaveLength(i === 4 ? 1 : 2);
    expect(history.questions[0]).toMatchObject({
      correctAnswer: 'A',
      ownAnswer: { choice: 'A', isCorrect: true, responseTime: (i + 1) * 100 },
    });
    if (i === 3) expect(history.questions[1]?.ownAnswer).toBeNull();
    expect(JSON.stringify(history)).not.toContain('playerId');
  }
});
it.each(['A', 'B'] as const)(
  'does not grant automatic victory to a sole survivor who answers %s',
  async (choice) => {
    const fixture = await setup(2, true);
    const { game, users } = fixture;
    await answerRound(fixture, [
      { choice: 'A', time: 100 },
      { choice: 'B', time: 200 },
    ]);
    const normal = await maintainGame(game.id);
    expect(normal.phase).toBe('results');
    expect(await db.gameResult.count({ where: { gameId: game.id } })).toBe(0);
    await runHostCommand(users[0]!.userId, {
      gameId: game.id,
      action: 'next',
      expectedVersion: normal.version,
      requestId: randomUUID(),
    });
    await answerRound(fixture, [{ choice, time: 100 }, null]);
    await maintainGame(game.id);
    const result = await db.gameResult.findUniqueOrThrow({
      where: { gameId: game.id },
    });
    expect(result.winnerId).toBe(
      choice === 'A' ? game.participants[0]!.id : null
    );
    expect(result.reason).toBe('final_question');
  }
);
it('excludes a departed fastest finalist and treats unanswered finalists as timeout', async () => {
  const fixture = await setup(3);
  const { game, users } = fixture;
  await answerRound(fixture, [
    { choice: 'A', time: 100 },
    { choice: 'A', time: 200 },
    null,
  ]);
  await leaveStartedGame(game.id, users[0]!.userId);
  await finishRound(game.id);
  expect(
    (await db.gameResult.findUniqueOrThrow({ where: { gameId: game.id } }))
      .winnerId
  ).toBe(game.participants[1]!.id);
  expect(
    (
      await db.participant.findUniqueOrThrow({
        where: { id: game.participants[2]!.id },
      })
    ).eliminationReason
  ).toBe('timeout');
});
it('does not reveal an unfinished final answer or final flag when the host cancels', async () => {
  const fixture = await setup(2);
  const { game, users } = fixture;
  await answerRound(fixture, [{ choice: 'A', time: 100 }, null]);
  const current = await db.game.findUniqueOrThrow({ where: { id: game.id } });
  await runHostCommand(users[0]!.userId, {
    gameId: game.id,
    action: 'cancel',
    expectedVersion: current.version,
    requestId: randomUUID(),
  });
  const events = await db.gameEventRecord.findMany({
    where: { gameId: game.id },
  });
  expect(events.filter((event) => event.type === 'QUESTION_ENDED')).toEqual([]);
  expect(events.filter((event) => event.type === 'GAME_ENDED')).toHaveLength(1);
  expect(JSON.stringify(events)).not.toContain('correctAnswer');
  expect(JSON.stringify(events)).not.toContain('isFinal');
  const result = await db.gameResult.findUniqueOrThrow({
    where: { gameId: game.id },
  });
  expect(result.winnerId).toBeNull();
  expect(result.statistics).toMatchObject({ questionStats: [] });
});
