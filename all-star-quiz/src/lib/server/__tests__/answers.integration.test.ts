import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '../db';
import { createGuestSession } from '../session';
import { createRoom, joinRoom } from '../rooms';
import { runHostCommand, withGame, closeQuestionIfReady } from '../game-flow';
import { enqueueAnswer } from '../answer-queue';
import { submitAnswer } from '../answers';
import { sweepGames } from '../presence';
import { appRouter } from '../api/router';
import { createContext } from '../api/context';
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
    question: '問題',
    choices: { A: '一', B: '二', C: '三', D: '四' },
    answer: 'A' as const,
    type: 'final' as const,
    timeLimit: 10,
    choiceImages: {},
    category: null,
    explanation: '秘密',
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
  const started = await runHostCommand(host.userId, {
    gameId: game.id,
    expectedVersion: game.version,
    requestId: randomUUID(),
    action: 'start',
  });
  const input = {
    gameId: game.id,
    questionId: question.id,
    requestId: randomUUID(),
    choice: 'A' as const,
  };
  return { host, peer, game, started, input };
};
it('accepts only server-timed answers and returns a private receipt without correctness', async () => {
  const { host, input } = await setup();
  const caller = appRouter.createCaller(
    await createContext(
      new NextRequest('http://localhost:3000/api/trpc', {
        headers: {
          origin: 'http://localhost:3000',
          cookie: `quiz-participant=${host.token}`,
        },
      }),
      new Headers()
    )
  );
  await expect(
    caller.answers.submit({
      ...input,
      answeredAt: 1,
      userId: 'forged',
    } as typeof input)
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  const receipt = await caller.answers.submit(input);
  expect(receipt).toMatchObject({
    requestId: input.requestId,
    questionId: input.questionId,
    choice: 'A',
  });
  expect(receipt.responseTime).toBeGreaterThanOrEqual(0);
  expect(receipt.responseTime).toBeLessThan(10000);
  expect(receipt).not.toHaveProperty('isCorrect');
  expect(receipt).not.toHaveProperty('answer');
  expect(await db.answer.findFirst()).toMatchObject({
    isCorrect: true,
    responseTime: receipt.responseTime,
    receivedAt: new Date(receipt.answeredAt),
  });
});
it('replays concurrent and post-deadline retries but refuses changed choices and new request IDs', async () => {
  const { host, input, game } = await setup();
  const [one, two] = await Promise.all([
    submitAnswer(host.userId, input),
    submitAnswer(host.userId, input),
  ]);
  expect(one).toEqual(two);
  expect(await db.answer.count()).toBe(1);
  await db.game.update({
    where: { id: game.id },
    data: { deadlineAt: new Date(0), phase: 'closing' },
  });
  expect(await submitAnswer(host.userId, input)).toEqual(one);
  await expect(
    submitAnswer(host.userId, { ...input, choice: 'B' })
  ).rejects.toMatchObject({ reason: 'REQUEST_CONFLICT' });
  await expect(
    submitAnswer(host.userId, { ...input, requestId: randomUUID() })
  ).rejects.toMatchObject({ reason: 'ALREADY_ANSWERED' });
});
it('rejects nonmembers, eliminated participants, other questions and invalid choices', async () => {
  const { host, peer, input, game } = await setup();
  await expect(
    submitAnswer((await createGuestSession()).userId, input)
  ).rejects.toMatchObject({ reason: 'FORBIDDEN' });
  await expect(
    submitAnswer(host.userId, { ...input, questionId: 'other-question' })
  ).rejects.toMatchObject({ reason: 'ANSWER_CLOSED' });
  await expect(
    submitAnswer(host.userId, { ...input, choice: 'Z' } as never)
  ).rejects.toThrow();
  await db.participant.updateMany({
    where: { gameId: game.id, userId: peer.userId },
    data: { isEliminated: true },
  });
  await expect(submitAnswer(peer.userId, input)).rejects.toMatchObject({
    reason: 'PLAYER_ELIMINATED',
  });
  expect(await db.answer.count()).toBe(0);
});
it('uses an exclusive deadline: deadline minus 1ms is valid, exact deadline is rejected', async () => {
  const { host, peer, game, input, started } = await setup();
  const early = await enqueueAnswer(host.userId, input);
  const late = await enqueueAnswer(peer.userId, {
    ...input,
    requestId: randomUUID(),
  });
  await db.answerSubmission.update({
    where: { id: early.id },
    data: { receivedAt: new Date(started.deadlineAt! - 1) },
  });
  await db.answerSubmission.update({
    where: { id: late.id },
    data: { receivedAt: new Date(started.deadlineAt!) },
  });
  await withGame(game.id, closeQuestionIfReady);
  expect(await submitAnswer(host.userId, input)).toMatchObject({
    responseTime: 9999,
  });
  await expect(
    submitAnswer(peer.userId, { ...input, requestId: late.requestId })
  ).rejects.toMatchObject({ reason: 'ANSWER_CLOSED' });
});
it('admits a request while the game is locked and honors its time even if processing finishes after the deadline', async () => {
  const { host, game, input } = await setup();
  let unlock!: (time: number) => void;
  let locked!: () => void;
  const entered = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const received = new Promise<number>((resolve) => {
    unlock = resolve;
  });
  const holding = withGame(game.id, async (tx) => {
    locked();
    const time = await received;
    await tx.game.update({
      where: { id: game.id },
      data: { deadlineAt: new Date(time + 1) },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await entered;
  const submission = await enqueueAnswer(host.userId, input);
  unlock(submission.receivedAt.getTime());
  await holding;
  await sweepGames();
  const receipt = await submitAnswer(host.userId, input);
  expect(receipt.answeredAt).toBe(submission.receivedAt.getTime());
  expect(await db.game.findUnique({ where: { id: game.id } })).toMatchObject({
    phase: 'closing',
  });
});
it('accepts one of concurrent distinct requests and preserves deterministic ordering for tied milliseconds', async () => {
  const { host, peer, input, game, started } = await setup();
  const first = await enqueueAnswer(host.userId, input);
  const second = await enqueueAnswer(peer.userId, {
    ...input,
    requestId: randomUUID(),
    choice: 'B',
  });
  await db.answerSubmission.updateMany({
    where: { gameId: game.id },
    data: { receivedAt: new Date(started.startedAt! + 100) },
  });
  await sweepGames();
  const answers = await db.answer.findMany({
    orderBy: { acceptanceSequence: 'asc' },
  });
  expect(answers.map((answer) => answer.responseTime)).toEqual([100, 100]);
  expect(answers.map((answer) => answer.acceptanceSequence)).toEqual([
    first.acceptanceSequence,
    second.acceptanceSequence,
  ]);
  expect(answers.map((answer) => answer.isCorrect)).toEqual([true, false]);
  expect(await db.game.findUnique({ where: { id: game.id } })).toMatchObject({
    phase: 'closing',
  });
  const other = await setup();
  const results = await Promise.allSettled([
    submitAnswer(other.host.userId, other.input),
    submitAnswer(other.host.userId, {
      ...other.input,
      requestId: randomUUID(),
      choice: 'D',
    }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({
    reason: { reason: 'ALREADY_ANSWERED' },
  });
});
it('recovers a pending admission after process loss and rejects pending work after cancellation', async () => {
  const { host, input, game } = await setup();
  await enqueueAnswer(host.userId, input);
  await sweepGames();
  expect(await submitAnswer(host.userId, input)).toMatchObject({ choice: 'A' });
  const other = await setup();
  await enqueueAnswer(other.host.userId, other.input);
  await db.game.update({
    where: { id: other.game.id },
    data: { phase: 'finished', finishReason: 'cancelled' },
  });
  await sweepGames();
  await expect(
    submitAnswer(other.host.userId, other.input)
  ).rejects.toMatchObject({ reason: 'ANSWER_CLOSED' });
  expect(await db.answer.count({ where: { gameId: game.id } })).toBe(1);
});

it('records UTC admission time even when the database connection uses another timezone', async () => {
  const { host, input } = await setup();
  const before = Date.now();
  const queued = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Asia/Tokyo'");
    return tx.answerSubmission.create({
      data: { ...input, userId: host.userId },
    });
  });
  expect(queued.receivedAt.getTime()).toBeGreaterThanOrEqual(before - 100);
  expect(queued.receivedAt.getTime()).toBeLessThanOrEqual(Date.now() + 100);
  expect(await submitAnswer(host.userId, input)).toMatchObject({
    answeredAt: queued.receivedAt.getTime(),
  });
});

it('never ranks a later admission earlier when the database clock moves backwards', async () => {
  const { host, peer, input } = await setup();
  const first = await enqueueAnswer(host.userId, input);
  const ahead = new Date(first.receivedAt.getTime() + 1000);
  await db.answerSubmission.update({
    where: { id: first.id },
    data: { receivedAt: ahead },
  });
  const second = await enqueueAnswer(peer.userId, {
    ...input,
    requestId: randomUUID(),
  });
  expect(second.receivedAt).toEqual(ahead);
  expect(second.acceptanceSequence).toBeGreaterThan(first.acceptanceSequence);
});
