import { persistGameResult } from './game-results';
import { questionResultSchema } from '../result-schema';
import { drainAnswers } from './answer-queue';
import { databaseTime } from './time';
import { appendGameEvent, appendStateEvent } from './game-events';
import { publicQuestion } from './game-state';
import type { Game, Prisma } from '@prisma/client';
import { z } from 'zod';
import { questionSnapshotSchema } from '../question-schema';
import { db } from './db';
import { GameFlowError } from './game-error';

export const commandSchema = z
  .object({
    gameId: z.string().uuid(),
    requestId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
    action: z.enum(['start', 'next', 'cancel']),
  })
  .strict();
export const progressSchema = z.object({
  gameId: z.string(),
  phase: z.enum(['waiting', 'playing', 'closing', 'results', 'finished']),
  version: z.number().int(),
  currentQuestionIndex: z.number().int(),
  startedAt: z.number().nullable(),
  deadlineAt: z.number().nullable(),
  finishReason: z.string().nullable(),
});
export const progressView = (game: Game) => ({
  gameId: game.id,
  phase: game.phase,
  version: game.version,
  currentQuestionIndex: game.currentQuestionIndex,
  startedAt: game.startedAt?.getTime() ?? null,
  deadlineAt: game.deadlineAt?.getTime() ?? null,
  finishReason: game.finishReason,
});
export const withGame = async <T>(
  gameId: string,
  action: (tx: Prisma.TransactionClient, game: Game) => Promise<T>
): Promise<T> => {
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR NO KEY UPDATE`;
      const game = await tx.game.findUnique({ where: { id: gameId } });
      if (!game)
        return new GameFlowError('GAME_NOT_FOUND', 'ゲームが見つかりません。');
      if (game.expiresAt.getTime() <= Date.now() && game.phase !== 'finished') {
        const expired = await tx.game.update({
          where: { id: gameId },
          data: {
            phase: 'finished',
            finishReason: 'expired',
            version: { increment: 1 },
          },
        });
        await persistGameResult(tx, expired);
        return new GameFlowError(
          'INVALID_PHASE',
          'ゲームの有効期限が切れました。'
        );
      }
      return action(tx, game);
    },
    { maxWait: 10000, timeout: 15000 }
  );
  if (result instanceof GameFlowError) throw result;
  return result;
};
const invalidPhase = () =>
  new GameFlowError('INVALID_PHASE', '現在の状態ではこの操作はできません。');
export const runHostCommand = async (
  userId: string,
  raw: z.input<typeof commandSchema>
) => {
  const input = commandSchema.parse(raw);
  return withGame(input.gameId, async (tx, game) => {
    const previous = await tx.gameCommand.findUnique({
      where: {
        gameId_requestId: { gameId: game.id, requestId: input.requestId },
      },
    });
    if (previous) {
      if (
        previous.userId !== userId ||
        previous.action !== input.action ||
        previous.expectedVersion !== input.expectedVersion
      )
        throw new GameFlowError(
          'REQUEST_CONFLICT',
          '同じ操作番号で異なる操作はできません。'
        );
      return progressSchema.parse(previous.response);
    }
    const host = await tx.participant.findUnique({
      where: { gameId_userId: { gameId: game.id, userId } },
    });
    if (!host?.isHost || host.leftAt)
      throw new GameFlowError('FORBIDDEN', '現在のホストのみ操作できます。');
    if (input.expectedVersion !== game.version)
      throw new GameFlowError(
        'STALE_VERSION',
        '状態が更新されています。再読み込みしてください。'
      );
    if (game.phase === 'finished') throw invalidPhase();
    let updated: Game;
    if (input.action === 'cancel') {
      updated = await tx.game.update({
        where: { id: game.id },
        data: {
          phase: 'finished',
          finishReason: 'cancelled',
          version: { increment: 1 },
        },
      });
    } else {
      const starting = input.action === 'start';
      if (
        (starting && game.phase !== 'waiting') ||
        (!starting && game.phase !== 'results')
      )
        throw invalidPhase();
      const participants = await tx.participant.findMany({
        where: { gameId: game.id, leftAt: null },
      });
      const questions = await tx.gameQuestion.findMany({
        where: { gameId: game.id },
        orderBy: { position: 'asc' },
      });
      const snapshots = questions.map((q) =>
        questionSnapshotSchema.safeParse(q.snapshot)
      );
      if (
        !questions.length ||
        snapshots.some(
          (q, i) =>
            !q.success ||
            q.data.type !== (i === questions.length - 1 ? 'final' : 'normal') ||
            questions[i]?.position !== i
        )
      )
        throw new GameFlowError(
          'INVALID_SETUP',
          '通常問題と最後の最終問題を設定してください。'
        );
      if (starting && (participants.length < 2 || participants.length > 20))
        throw new GameFlowError('INVALID_SETUP', '2〜20人で開始してください。');
      if (!starting && !participants.some((p) => !p.isEliminated))
        throw invalidPhase();
      const index = starting ? 0 : game.currentQuestionIndex + 1;
      if (!questions[index]) throw invalidPhase();
      if (starting)
        await tx.participant.updateMany({
          where: { gameId: game.id, leftAt: null },
          data: {
            isEliminated: false,
            eliminationReason: null,
            eliminatedAtQuestion: null,
          },
        });
      const now = (await databaseTime(tx)).getTime();
      updated = await tx.game.update({
        where: { id: game.id },
        data: {
          phase: 'playing',
          currentQuestionIndex: index,
          startedAt: new Date(now),
          deadlineAt: new Date(now + 10000),
          version: { increment: 1 },
        },
      });
      await appendGameEvent(tx, updated, 'QUESTION_STARTED', {
        question: publicQuestion(questions[index]!.snapshot),
        startedAt: now,
        deadlineAt: now + 10000,
      });
    }
    await persistGameResult(tx, updated);
    const response = progressView(updated);
    await tx.gameCommand.create({ data: { ...input, userId, response } });
    return response;
  });
};
export const readGameProgress = async (code: string, userId: string) => {
  const game = await db.game.findUnique({
    where: { code },
    include: { participants: { where: { userId } } },
  });
  if (!game || !game.participants.length)
    throw new GameFlowError('FORBIDDEN', 'このゲームに参加してください。');
  return progressView(game);
};
// Called inside the same room transaction as answer acceptance or departure.
export const closeQuestionIfReady = async (
  tx: Prisma.TransactionClient,
  initialGame: Game
) => {
  const game = await drainAnswers(tx, initialGame);
  if (game.phase !== 'playing') return game;
  const living = await tx.participant.findMany({
    where: { gameId: game.id, leftAt: null, isEliminated: false },
    select: { id: true },
  });
  const question = await tx.gameQuestion.findUnique({
    where: {
      gameId_position: { gameId: game.id, position: game.currentQuestionIndex },
    },
  });
  const answered = question
    ? await tx.answer.count({
        where: {
          gameQuestionId: question.id,
          participantId: { in: living.map((p) => p.id) },
        },
      })
    : 0;
  if (
    (game.deadlineAt &&
      game.deadlineAt.getTime() <= (await databaseTime(tx)).getTime()) ||
    answered === living.length
  ) {
    const closed = await tx.game.update({
      where: { id: game.id },
      data: { phase: 'closing', version: { increment: 1 } },
    });
    await appendGameEvent(tx, closed, 'QUESTION_CLOSED', {
      questionId: question?.questionId || '',
    });
    return closed;
  }
  return game;
};
// Scoring (Issues #13/#14) persists its outcome in this transaction, then calls this transition.
export const completeQuestion = async (
  tx: Prisma.TransactionClient,
  game: Game
) => {
  if (game.phase !== 'closing') throw invalidPhase();
  const question = await tx.gameQuestion.findUniqueOrThrow({
    where: {
      gameId_position: { gameId: game.id, position: game.currentQuestionIndex },
    },
  });
  const snapshot = questionSnapshotSchema.parse(question.snapshot);
  const living = await tx.participant.count({
    where: { gameId: game.id, leftAt: null, isEliminated: false },
  });
  const reason =
    snapshot.type === 'final'
      ? 'final_question'
      : living === 0
        ? 'all_eliminated'
        : null;
  const result = questionResultSchema.parse(question.result);
  const published = await tx.game.update({
    where: { id: game.id },
    data: { phase: 'results', version: { increment: 1 } },
  });
  await tx.gameEventRecord.create({
    data: {
      gameId: game.id,
      version: published.version,
      type: 'QUESTION_ENDED',
      payload: result,
      createdAt: await databaseTime(tx),
    },
  });
  if (!reason) return published;
  const finished = await tx.game.update({
    where: { id: game.id },
    data: {
      phase: 'finished',
      finishReason: reason,
      version: { increment: 1 },
    },
  });
  await persistGameResult(tx, finished);
  return finished;
};
export const leaveStartedGame = (gameId: string, userId: string) =>
  withGame(gameId, async (tx, game) => {
    if (game.phase === 'waiting' || game.phase === 'finished')
      throw invalidPhase();
    const player = await tx.participant.findUnique({
      where: { gameId_userId: { gameId, userId } },
    });
    if (!player)
      throw new GameFlowError('FORBIDDEN', 'このゲームに参加してください。');
    if (player.leftAt) return progressView(game);
    await tx.realtimeConnection.deleteMany({
      where: { participantId: player.id },
    });
    await tx.participant.update({
      where: { id: player.id },
      data: {
        leftAt: new Date(),
        isHost: false,
        ...(!player.isEliminated
          ? {
              isEliminated: true,
              eliminationReason: 'left',
              eliminatedAtQuestion: game.currentQuestionIndex,
            }
          : {}),
      },
    });
    const remaining = await tx.participant.findMany({
      where: { gameId, leftAt: null },
      orderBy: { joinedOrder: 'asc' },
    });
    if (player.isHost && remaining[0])
      await tx.participant.update({
        where: { id: remaining[0].id },
        data: { isHost: true },
      });
    const reason = !remaining.length
      ? 'all_left'
      : game.phase === 'results' && remaining.every((p) => p.isEliminated)
        ? 'all_eliminated'
        : null;
    let updated = await tx.game.update({
      where: { id: gameId },
      data: { version: { increment: 1 } },
    });
    await appendStateEvent(tx, updated);
    if (reason)
      updated = await tx.game.update({
        where: { id: gameId },
        data: {
          phase: 'finished',
          finishReason: reason,
          version: { increment: 1 },
        },
      });
    const closed = await closeQuestionIfReady(tx, updated);
    await persistGameResult(tx, closed);
    return progressView(closed);
  });
