import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { createGuestSession } from '../session';
import { createRoom, joinRoom } from '../rooms';
import {
  runHostCommand,
  withGame,
  closeQuestionIfReady,
  completeQuestion,
  leaveStartedGame,
} from '../game-flow';
import {
  heartbeatConnection,
  disconnectConnection,
  maintainGame,
  sweepGames,
} from '../presence';
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
    include: { participants: { orderBy: { joinedOrder: 'asc' } } },
  });
  for (const [position, type] of (['normal', 'final'] as const).entries()) {
    const fields = {
      question: '問題',
      choices: { A: '一', B: '二', C: '三', D: '四' },
      answer: 'A' as const,
      type,
      timeLimit: 10,
      choiceImages: {},
      category: null,
      explanation: null,
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
  return { host, peer, game };
};
const command = (
  gameId: string,
  expectedVersion: number,
  action: 'start' | 'next' | 'cancel' = 'start'
) => ({ gameId, expectedVersion, action, requestId: randomUUID() });
it('starts once with server timestamps, resets survivors, and replays the identical receipt', async () => {
  const { host, game } = await setup();
  await db.participant.updateMany({
    where: { gameId: game.id },
    data: { isEliminated: true, eliminationReason: 'wrong' },
  });
  const input = command(game.id, game.version);
  const [one, two] = await Promise.all([
    runHostCommand(host.userId, input),
    runHostCommand(host.userId, input),
  ]);
  expect(one).toEqual(two);
  expect(one.phase).toBe('playing');
  expect(one.currentQuestionIndex).toBe(0);
  expect(one.deadlineAt! - one.startedAt!).toBe(10000);
  expect(
    await db.participant.count({
      where: { gameId: game.id, isEliminated: true },
    })
  ).toBe(0);
  expect(await db.gameCommand.count()).toBe(1);
  await expect(
    runHostCommand(host.userId, { ...input, action: 'cancel' })
  ).rejects.toMatchObject({ reason: 'REQUEST_CONFLICT' });
  await expect(
    runHostCommand(host.userId, command(game.id, game.version))
  ).rejects.toMatchObject({ reason: 'STALE_VERSION' });
  await expect(
    joinRoom(game.code, '途中参加', (await createGuestSession()).userId)
  ).rejects.toMatchObject({ status: 409 });
});
it('requires a host, two participants, and a complete normal/final question sequence', async () => {
  const { host, peer, game } = await setup();
  await expect(
    runHostCommand(peer.userId, command(game.id, game.version))
  ).rejects.toMatchObject({ reason: 'FORBIDDEN' });
  await db.participant.deleteMany({
    where: { gameId: game.id, userId: peer.userId },
  });
  await expect(
    runHostCommand(host.userId, command(game.id, game.version))
  ).rejects.toMatchObject({ reason: 'INVALID_SETUP' });
  await joinRoom(game.code, '参加者', peer.userId);
  const current = await db.game.findUniqueOrThrow({ where: { id: game.id } });
  await db.gameQuestion.deleteMany({ where: { gameId: game.id, position: 1 } });
  await expect(
    runHostCommand(host.userId, command(game.id, current.version))
  ).rejects.toMatchObject({ reason: 'INVALID_SETUP' });
});
it('closes exactly once at the persisted deadline and advances results to the final and finish', async () => {
  const { host, game } = await setup();
  const started = await runHostCommand(
    host.userId,
    command(game.id, game.version)
  );
  expect((await maintainGame(game.id)).phase).toBe('playing');
  await db.game.update({
    where: { id: game.id },
    data: { deadlineAt: new Date(0) },
  });
  const [one, two] = await Promise.all([
    withGame(game.id, closeQuestionIfReady),
    withGame(game.id, closeQuestionIfReady),
  ]);
  expect(one.phase).toBe('closing');
  expect(two.version).toBe(one.version);
  expect(one.version).toBe(started.version + 1);
  await expect(
    runHostCommand(host.userId, command(game.id, one.version, 'next'))
  ).rejects.toMatchObject({ reason: 'INVALID_PHASE' });
  const results = await withGame(game.id, completeQuestion);
  expect(results.phase).toBe('results');
  const next = await runHostCommand(
    host.userId,
    command(game.id, results.version, 'next')
  );
  expect(next.currentQuestionIndex).toBe(1);
  expect(next.phase).toBe('playing');
  await db.game.update({
    where: { id: game.id },
    data: { deadlineAt: new Date(0) },
  });
  await maintainGame(game.id);
  const final = await withGame(game.id, completeQuestion);
  expect(final).toMatchObject({
    phase: 'finished',
    finishReason: 'final_question',
  });
  await expect(
    runHostCommand(host.userId, command(game.id, final.version, 'next'))
  ).rejects.toMatchObject({ reason: 'INVALID_PHASE' });
});
it('closes early only when every surviving participant has a persisted answer', async () => {
  const { host, game } = await setup();
  await runHostCommand(host.userId, command(game.id, game.version));
  const question = await db.gameQuestion.findUniqueOrThrow({
    where: { gameId_position: { gameId: game.id, position: 0 } },
  });
  for (const [index, player] of game.participants.entries()) {
    await db.answer.create({
      data: {
        gameId: game.id,
        gameQuestionId: question.id,
        participantId: player.id,
        requestId: randomUUID(),
        choice: 'A',
        receivedAt: new Date(),
        responseTime: 100,
        acceptanceSequence: index,
        isCorrect: true,
      },
    });
    expect((await withGame(game.id, closeQuestionIfReady)).phase).toBe(
      index === 0 ? 'playing' : 'closing'
    );
  }
});
it('handles cancellation, explicit host departure, all-left and all-eliminated termination', async () => {
  const { host, peer, game } = await setup();
  await runHostCommand(host.userId, command(game.id, game.version));
  await leaveStartedGame(game.id, host.userId);
  expect(
    await db.participant.findFirst({
      where: { gameId: game.id, userId: peer.userId },
    })
  ).toMatchObject({ isHost: true });
  expect(
    await db.participant.findFirst({
      where: { gameId: game.id, userId: host.userId },
    })
  ).toMatchObject({
    isEliminated: true,
    eliminationReason: 'left',
    isHost: false,
  });
  expect(await leaveStartedGame(game.id, peer.userId)).toMatchObject({
    phase: 'finished',
    finishReason: 'all_left',
  });
  const other = await setup();
  const input = command(other.game.id, other.game.version, 'cancel');
  expect(await runHostCommand(other.host.userId, input)).toMatchObject({
    phase: 'finished',
    finishReason: 'cancelled',
  });
  expect(await runHostCommand(other.host.userId, input)).toMatchObject({
    finishReason: 'cancelled',
  });
  const eliminated = await setup();
  await runHostCommand(
    eliminated.host.userId,
    command(eliminated.game.id, eliminated.game.version)
  );
  await db.game.update({
    where: { id: eliminated.game.id },
    data: { phase: 'closing' },
  });
  await db.participant.updateMany({
    where: { gameId: eliminated.game.id },
    data: { isEliminated: true },
  });
  expect(await withGame(eliminated.game.id, completeQuestion)).toMatchObject({
    phase: 'finished',
    finishReason: 'all_eliminated',
  });
});
it('keeps host ownership while another tab is connected and transfers after the disconnect grace', async () => {
  const { game } = await setup();
  const [host, peer] = game.participants;
  await heartbeatConnection('tab1', game.id, host!.id);
  await heartbeatConnection('tab2', game.id, host!.id);
  await heartbeatConnection('peer', game.id, peer!.id);
  await disconnectConnection('tab1', game.id, host!.id);
  await maintainGame(game.id);
  expect(
    await db.participant.findUnique({ where: { id: host!.id } })
  ).toMatchObject({ isHost: true, disconnectedAt: null });
  await disconnectConnection('tab2', game.id, host!.id);
  await maintainGame(game.id);
  expect(
    await db.participant.findUnique({ where: { id: host!.id } })
  ).toMatchObject({ isHost: true });
  await db.participant.update({
    where: { id: host!.id },
    data: { disconnectedAt: new Date(Date.now() - 30001) },
  });
  await maintainGame(game.id);
  expect(
    await db.participant.findUnique({ where: { id: peer!.id } })
  ).toMatchObject({ isHost: true });
  await heartbeatConnection('return', game.id, host!.id);
  expect(
    await db.participant.findUnique({ where: { id: host!.id } })
  ).toMatchObject({ isHost: false, isEliminated: false });
});
it('recovers missed deadlines and crashed connections, defers host transfer without a candidate, and expires rooms', async () => {
  const active = await setup();
  await runHostCommand(
    active.host.userId,
    command(active.game.id, active.game.version)
  );
  await db.game.update({
    where: { id: active.game.id },
    data: { deadlineAt: new Date(0) },
  });
  await sweepGames();
  expect(
    await db.game.findUnique({ where: { id: active.game.id } })
  ).toMatchObject({ phase: 'finished', finishReason: 'all_eliminated' });
  const { game } = await setup();
  await heartbeatConnection('crashed', game.id, game.participants[0]!.id);
  await db.realtimeConnection.update({
    where: { id: 'crashed' },
    data: { expiresAt: new Date(0) },
  });
  await sweepGames();
  await db.participant.update({
    where: { id: game.participants[0]!.id },
    data: { disconnectedAt: new Date(0) },
  });
  await sweepGames();
  expect(
    await db.participant.findUnique({ where: { id: game.participants[0]!.id } })
  ).toMatchObject({ isHost: true });
  await db.game.update({
    where: { id: game.id },
    data: { expiresAt: new Date(0) },
  });
  await sweepGames();
  expect(await db.game.findUnique({ where: { id: game.id } })).toMatchObject({
    phase: 'finished',
    finishReason: 'expired',
  });
});

it('serializes different host requests and keeps cancellation terminal', async () => {
  const { host, game } = await setup();
  const results = await Promise.allSettled([
    runHostCommand(host.userId, command(game.id, game.version)),
    runHostCommand(host.userId, command(game.id, game.version)),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { reason: 'STALE_VERSION' },
  });
  await db.game.update({
    where: { id: game.id },
    data: { deadlineAt: new Date(0) },
  });
  const closing = await withGame(game.id, closeQuestionIfReady);
  await runHostCommand(
    host.userId,
    command(game.id, closing.version, 'cancel')
  );
  await expect(withGame(game.id, completeQuestion)).rejects.toMatchObject({
    reason: 'INVALID_PHASE',
  });
  expect(await maintainGame(game.id)).toMatchObject({
    phase: 'finished',
    finishReason: 'cancelled',
  });
});
