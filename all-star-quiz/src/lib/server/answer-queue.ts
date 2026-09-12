import type { Game, Prisma } from '@prisma/client';
import { z } from 'zod';
import { questionSnapshotSchema } from '../question-schema';
import { db } from './db';
import { GameFlowError } from './game-error';
export const answerInputSchema = z
  .object({
    gameId: z.string().uuid(),
    questionId: z.string().min(1).max(128),
    requestId: z.string().uuid(),
    choice: z.enum(['A', 'B', 'C', 'D']),
  })
  .strict();
export const receiptSchema = z.object({
  requestId: z.string(),
  questionId: z.string(),
  choice: z.enum(['A', 'B', 'C', 'D']),
  answeredAt: z.number(),
  responseTime: z.number().int().nonnegative(),
});
export const databaseTime = async (tx: Prisma.TransactionClient) => {
  const rows = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC') AS now`;
  return rows[0]!.now;
};
// The short admission gate is distinct from the room's processing lock.
// Admission never waits for a slow answer/game transaction while holding this gate.
const admissionGate = async (tx: Prisma.TransactionClient, gameId: string) => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${gameId}))::text`;
};
export const enqueueAnswer = async (
  userId: string,
  raw: z.input<typeof answerInputSchema>
) => {
  const input = answerInputSchema.parse(raw);
  return db.$transaction(
    async (tx) => {
      await admissionGate(tx, input.gameId);
      const existing = await tx.answerSubmission.findUnique({
        where: {
          gameId_userId_questionId_requestId: {
            gameId: input.gameId,
            userId,
            questionId: input.questionId,
            requestId: input.requestId,
          },
        },
      });
      if (existing) {
        if (existing.choice !== input.choice)
          throw new GameFlowError(
            'REQUEST_CONFLICT',
            '確定した回答は変更できません。'
          );
        return existing;
      }
      const member = await tx.participant.findUnique({
        where: { gameId_userId: { gameId: input.gameId, userId } },
      });
      if (!member)
        throw new GameFlowError('FORBIDDEN', 'このゲームに参加してください。');
      return tx.answerSubmission.create({ data: { ...input, userId } });
    },
    { maxWait: 10000, timeout: 15000 }
  );
};
export const drainAnswers = async (
  tx: Prisma.TransactionClient,
  game: Game
) => {
  // Holding the processing lock before this barrier guarantees every committed,
  // pre-close admission is drained before the phase becomes closing.
  await admissionGate(tx, game.id);
  const pending = await tx.answerSubmission.findMany({
    where: { gameId: game.id, processedAt: null },
    orderBy: { acceptanceSequence: 'asc' },
  });
  if (!pending.length) return game;
  const question = await tx.gameQuestion.findUnique({
    where: {
      gameId_position: { gameId: game.id, position: game.currentQuestionIndex },
    },
  });
  let accepted = 0;
  for (const submission of pending) {
    const player = await tx.participant.findUnique({
      where: { gameId_userId: { gameId: game.id, userId: submission.userId } },
    });
    const previous = player
      ? await tx.answer.findFirst({
          where: {
            gameId: game.id,
            participantId: player.id,
            gameQuestion: { questionId: submission.questionId },
          },
        })
      : null;
    const errorCode = !player
      ? 'FORBIDDEN'
      : previous
        ? 'ALREADY_ANSWERED'
        : player.leftAt || player.isEliminated
          ? 'PLAYER_ELIMINATED'
          : game.phase !== 'playing' ||
              !question ||
              question.questionId !== submission.questionId ||
              !game.startedAt ||
              !game.deadlineAt ||
              submission.receivedAt < game.startedAt ||
              submission.receivedAt >= game.deadlineAt ||
              submission.receivedAt >= game.expiresAt
            ? 'ANSWER_CLOSED'
            : null;
    if (errorCode) {
      await tx.answerSubmission.update({
        where: { id: submission.id },
        data: { processedAt: new Date(), errorCode },
      });
      continue;
    }
    const snapshot = questionSnapshotSchema.parse(question!.snapshot);
    const responseTime =
      submission.receivedAt.getTime() - game.startedAt!.getTime();
    await tx.answer.create({
      data: {
        gameId: game.id,
        gameQuestionId: question!.id,
        participantId: player!.id,
        requestId: submission.requestId,
        choice: submission.choice,
        receivedAt: submission.receivedAt,
        responseTime,
        acceptanceSequence: submission.acceptanceSequence,
        isCorrect: snapshot.answer === submission.choice,
      },
    });
    const receipt = {
      requestId: submission.requestId,
      questionId: submission.questionId,
      choice: submission.choice,
      answeredAt: submission.receivedAt.getTime(),
      responseTime,
    };
    await tx.answerSubmission.update({
      where: { id: submission.id },
      data: { processedAt: new Date(), receipt },
    });
    accepted++;
  }
  return accepted
    ? tx.game.update({
        where: { id: game.id },
        data: { version: { increment: accepted } },
      })
    : game;
};
export const submissionError = (code: string) => {
  const reason = z
    .enum([
      'FORBIDDEN',
      'PLAYER_ELIMINATED',
      'ANSWER_CLOSED',
      'ALREADY_ANSWERED',
    ])
    .parse(code);
  const messages = {
    FORBIDDEN: 'このゲームに参加してください。',
    PLAYER_ELIMINATED: '現在は回答できません。',
    ANSWER_CLOSED: 'この問題の回答受付は終了しています。',
    ALREADY_ANSWERED: '回答はすでに確定しています。',
  };
  return new GameFlowError(reason, messages[reason]);
};
