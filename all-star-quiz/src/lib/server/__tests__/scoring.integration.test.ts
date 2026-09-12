import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { createGuestSession } from '../session';
import { createRoom, joinRoom } from '../rooms';
import {
  runHostCommand,
  withGame,
  closeQuestionIfReady,
  leaveStartedGame,
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
const setup = async (
  answers: ({ choice: 'A' | 'B'; time: number } | null)[]
) => {
  const users = await Promise.all(answers.map(() => createGuestSession()));
  const room = await createRoom('ホスト', users[0]!.userId);
  for (const [i, user] of users.slice(1).entries())
    await joinRoom(room.room.code, `参加者${i}`, user.userId);
  const game = await db.game.findUniqueOrThrow({
    where: { code: room.room.code },
    include: { participants: { orderBy: { joinedOrder: 'asc' } } },
  });
  let questionId = '';
  for (const [position, type] of (['normal', 'final'] as const).entries()) {
    const fields = {
      question: '問題',
      choices: { A: '一', B: '二', C: '三', D: '四' },
      answer: 'A' as const,
      type,
      timeLimit: 10,
      choiceImages: {},
      category: null,
      explanation: '解説',
    };
    const question = await db.question.create({ data: fields });
    await db.gameQuestion.create({
      data: {
        gameId: game.id,
        questionId: question.id,
        position,
        snapshot: { ...fields, id: question.id, version: 0 },
      },
    });
    if (!position) questionId = question.id;
  }
  await runHostCommand(users[0]!.userId, {
    gameId: game.id,
    requestId: randomUUID(),
    expectedVersion: game.version,
    action: 'start',
  });
  const startedAt = Date.now() - 20000;
  await db.game.update({
    where: { id: game.id },
    data: {
      startedAt: new Date(startedAt),
      deadlineAt: new Date(startedAt + 10000),
    },
  });
  for (const [i, answer] of answers.entries()) {
    if (!answer) continue;
    const submission = await enqueueAnswer(users[i]!.userId, {
      gameId: game.id,
      questionId,
      requestId: randomUUID(),
      choice: answer.choice,
    });
    await db.answerSubmission.update({
      where: { id: submission.id },
      data: { receivedAt: new Date(startedAt + answer.time) },
    });
  }
  return { game, users, questionId };
};
it('persists wrong, timeout and slowest reasons once and allows the sole survivor to advance', async () => {
  const { game, users, questionId } = await setup([
    { choice: 'A', time: 100 },
    { choice: 'B', time: 200 },
    { choice: 'A', time: 300 },
    null,
  ]);
  await db.question.update({
    where: { id: questionId },
    data: { answer: 'B', explanation: '後の編集' },
  });
  const [one, two] = await Promise.all([
    maintainGame(game.id),
    maintainGame(game.id),
  ]);
  expect(one.phase).toBe('results');
  expect(two.version).toBe(one.version);
  const players = await db.participant.findMany({
    where: { gameId: game.id },
    orderBy: { joinedOrder: 'asc' },
  });
  expect(players.map((p) => p.eliminationReason)).toEqual([
    null,
    'wrong',
    'slowest',
    'timeout',
  ]);
  const question = await db.gameQuestion.findUniqueOrThrow({
    where: { gameId_position: { gameId: game.id, position: 0 } },
  });
  expect(question.result).toMatchObject({
    correctAnswer: 'A',
    explanation: '解説',
    isFinal: false,
  });
  expect(JSON.stringify(question.result)).not.toContain(users[0]!.userId);
  expect(question.resolvedAt).toBeInstanceOf(Date);
  await maintainGame(game.id);
  expect(
    (await db.gameQuestion.findUniqueOrThrow({ where: { id: question.id } }))
      .result
  ).toEqual(question.result);
  expect(
    await runHostCommand(users[0]!.userId, {
      gameId: game.id,
      requestId: randomUUID(),
      expectedVersion: one.version,
      action: 'next',
    })
  ).toMatchObject({ phase: 'playing', currentQuestionIndex: 1 });
});
it('finishes with no winner when nobody is correct', async () => {
  const { game } = await setup([{ choice: 'B', time: 100 }, null]);
  expect(await maintainGame(game.id)).toMatchObject({
    phase: 'finished',
    finishReason: 'all_eliminated',
  });
  const question = await db.gameQuestion.findFirstOrThrow({
    where: { gameId: game.id, position: 0 },
  });
  expect(question.result).not.toHaveProperty('winnerId');
  expect(
    await db.participant.count({
      where: { gameId: game.id, isEliminated: false },
    })
  ).toBe(0);
});
it('breaks equal-time ties by the later acceptance sequence', async () => {
  const { game } = await setup([
    { choice: 'A', time: 100 },
    { choice: 'A', time: 100 },
    { choice: 'A', time: 100 },
  ]);
  await maintainGame(game.id);
  const players = await db.participant.findMany({
    where: { gameId: game.id },
    orderBy: { joinedOrder: 'asc' },
  });
  expect(players.map((p) => p.eliminationReason)).toEqual([
    null,
    null,
    'slowest',
  ]);
});
it('excludes a departed correct player and keeps the published result immutable after a later departure', async () => {
  const { game, users } = await setup([
    { choice: 'A', time: 100 },
    { choice: 'A', time: 300 },
    { choice: 'B', time: 500 },
  ]);
  await withGame(game.id, closeQuestionIfReady);
  await leaveStartedGame(game.id, users[1]!.userId);
  const result = await maintainGame(game.id);
  expect(result.phase).toBe('results');
  const players = await db.participant.findMany({
    where: { gameId: game.id },
    orderBy: { joinedOrder: 'asc' },
  });
  expect(players.map((p) => p.eliminationReason)).toEqual([
    null,
    'left',
    'wrong',
  ]);
  const question = await db.gameQuestion.findFirstOrThrow({
    where: { gameId: game.id, position: 0 },
  });
  expect(await leaveStartedGame(game.id, users[0]!.userId)).toMatchObject({
    phase: 'finished',
    finishReason: 'all_eliminated',
  });
  expect(
    (await db.gameQuestion.findUniqueOrThrow({ where: { id: question.id } }))
      .result
  ).toEqual(question.result);
});
it('does not publish a result when cancellation wins before scoring', async () => {
  const { game, users } = await setup([{ choice: 'A', time: 100 }, null]);
  const closed = await withGame(game.id, closeQuestionIfReady);
  await runHostCommand(users[0]!.userId, {
    gameId: game.id,
    requestId: randomUUID(),
    expectedVersion: closed.version,
    action: 'cancel',
  });
  expect(await maintainGame(game.id)).toMatchObject({
    phase: 'finished',
    finishReason: 'cancelled',
  });
  expect(
    (
      await db.gameQuestion.findFirstOrThrow({
        where: { gameId: game.id, position: 0 },
      })
    ).result
  ).toBeNull();
});
