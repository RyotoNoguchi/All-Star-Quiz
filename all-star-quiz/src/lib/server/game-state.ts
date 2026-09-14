import { Prisma, type Game } from '@prisma/client';
import {
  publicSnapshotSchema,
  privateSnapshotSchema,
  publicQuestionSchema,
} from '../realtime-schema';
import { gameResultSchema, questionResultSchema } from '../result-schema';
import { questionSnapshotSchema } from '../question-schema';
import { publicParticipant } from './public-data';
import { databaseTime } from './time';
import { db } from './db';
import { GameFlowError } from './game-error';
export const publicQuestion = (raw: unknown) => {
  const question = questionSnapshotSchema.parse(raw);
  return publicQuestionSchema.parse({
    id: question.id,
    question: question.question,
    choices: question.choices,
    choiceImages: question.choiceImages,
    ...(question.category ? { category: question.category } : {}),
  });
};
export const snapshotForGame = async (
  tx: Prisma.TransactionClient,
  game: Game
) => {
  const players = await tx.participant.findMany({
    where: { gameId: game.id },
    orderBy: { joinedOrder: 'asc' },
  });
  const question = await tx.gameQuestion.findUnique({
    where: {
      gameId_position: { gameId: game.id, position: game.currentQuestionIndex },
    },
  });
  const last = await tx.gameQuestion.findFirst({
    where: { gameId: game.id, resolvedAt: { not: null } },
    orderBy: { position: 'desc' },
  });
  const saved =
    game.phase === 'finished'
      ? await tx.gameResult.findUnique({ where: { gameId: game.id } })
      : null;
  const result = saved
    ? gameResultSchema.parse({
        gameId: game.id,
        ...(saved.winnerId ? { winnerId: saved.winnerId } : {}),
        reason: saved.reason,
        finalRanking: saved.ranking,
        totalQuestions: saved.totalQuestions,
        completedAt: saved.completedAt.toISOString(),
        statistics: saved.statistics,
      })
    : undefined;
  return publicSnapshotSchema.parse({
    gameId: game.id,
    code: game.code,
    version: game.version,
    serverTime: (await databaseTime(tx)).getTime(),
    phase: game.phase,
    players: players.map(publicParticipant),
    hostId: players.find((p) => p.isHost && !p.leftAt)?.id || '',
    ...(question && game.phase !== 'finished'
      ? { question: publicQuestion(question.snapshot) }
      : {}),
    ...(game.startedAt ? { startedAt: game.startedAt.getTime() } : {}),
    ...(game.deadlineAt ? { deadlineAt: game.deadlineAt.getTime() } : {}),
    answerCount: question
      ? await tx.answer.count({
          where: { gameQuestionId: question.id, participant: { leftAt: null } },
        })
      : 0,
    ...(last?.result
      ? { lastResult: questionResultSchema.parse(last.result) }
      : {}),
    ...(result ? { result } : {}),
  });
};
export const readPrivateSnapshot = async (code: string, userId: string) =>
  db.$transaction(
    async (tx) => {
      const game = await tx.game.findUnique({ where: { code } });
      if (!game)
        throw new GameFlowError('GAME_NOT_FOUND', 'ゲームが見つかりません。');
      const player = await tx.participant.findUnique({
        where: { gameId_userId: { gameId: game.id, userId } },
      });
      if (!player || player.leftAt)
        throw new GameFlowError('FORBIDDEN', 'このゲームに参加してください。');
      const state = await snapshotForGame(tx, game);
      const ownAnswer = await tx.answer.findFirst({
        where: {
          gameId: game.id,
          participantId: player.id,
          gameQuestion: { position: game.currentQuestionIndex },
        },
        include: { gameQuestion: { select: { questionId: true } } },
      });
      return privateSnapshotSchema.parse({
        ...state,
        playerId: player.id,
        ...(ownAnswer
          ? {
              ownAnswer: {
                requestId: ownAnswer.requestId,
                questionId: ownAnswer.gameQuestion.questionId,
                choice: ownAnswer.choice,
                answeredAt: ownAnswer.receivedAt.getTime(),
                responseTime: ownAnswer.responseTime,
              },
            }
          : {}),
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );

export const readMonitorSnapshot = async (code: string, userId: string) =>
  db.$transaction(
    async (tx) => {
      const game = await tx.game.findUnique({ where: { code } });
      if (!game || game.expiresAt.getTime() <= Date.now())
        throw new GameFlowError(
          'GAME_NOT_FOUND',
          'ルームの有効期限が切れました。'
        );
      const host = await tx.participant.findFirst({
        where: { gameId: game.id, userId, isHost: true, leftAt: null },
      });
      if (!host)
        throw new GameFlowError(
          'FORBIDDEN',
          'ホストだけがモニターを表示できます。'
        );
      return snapshotForGame(tx, game);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
