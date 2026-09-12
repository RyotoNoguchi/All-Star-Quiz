import type { Game, Participant, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { PublicPlayer, QuestionResult } from '@/types/game';
import { normalEliminations } from '../scoring';
import { questionSnapshotSchema } from '../question-schema';
import { completeQuestion } from './game-flow';
import { databaseTime } from './answer-queue';

export const publicParticipant = (player: Participant): PublicPlayer => ({
  id: player.id,
  name: player.name,
  isHost: player.isHost,
  isEliminated: player.isEliminated,
  ...(player.eliminationReason
    ? {
        eliminationReason: z
          .enum(['wrong', 'timeout', 'slowest', 'left'])
          .parse(player.eliminationReason),
      }
    : {}),
  ...(player.leftAt ? { leftAt: player.leftAt.getTime() } : {}),
});
export const scoreNormalQuestion = async (
  tx: Prisma.TransactionClient,
  game: Game
) => {
  if (game.phase !== 'closing') return game;
  const question = await tx.gameQuestion.findUniqueOrThrow({
    where: {
      gameId_position: { gameId: game.id, position: game.currentQuestionIndex },
    },
  });
  if (question.result !== null) return game;
  const snapshot = questionSnapshotSchema.parse(question.snapshot);
  if (snapshot.type !== 'normal') return game;
  const players = await tx.participant.findMany({
    where: { gameId: game.id },
    orderBy: { joinedOrder: 'asc' },
  });
  const answers = await tx.answer.findMany({
    where: { gameQuestionId: question.id },
    orderBy: { acceptanceSequence: 'asc' },
  });
  const eliminated = normalEliminations(
    players.map((p) => ({
      id: p.id,
      isEliminated: p.isEliminated,
      hasLeft: p.leftAt !== null,
    })),
    answers.map((a) => ({
      playerId: a.participantId,
      isCorrect: a.isCorrect,
      responseTime: a.responseTime,
      acceptanceSequence: a.acceptanceSequence,
    }))
  );
  for (const player of eliminated)
    await tx.participant.update({
      where: { id: player.playerId },
      data: { isEliminated: true, eliminationReason: player.reason },
    });
  const updated = await tx.participant.findMany({
    where: { gameId: game.id },
    orderBy: { joinedOrder: 'asc' },
  });
  const result: QuestionResult = {
    questionId: question.questionId,
    correctAnswer: snapshot.answer,
    isFinal: false,
    ...(snapshot.explanation ? { explanation: snapshot.explanation } : {}),
    answers: answers.map((answer) => ({
      playerId: answer.participantId,
      questionId: question.questionId,
      choice: answer.choice,
      answeredAt: answer.receivedAt.getTime(),
      requestId: answer.requestId,
      acceptanceSequence: answer.acceptanceSequence,
      responseTime: answer.responseTime,
      isCorrect: answer.isCorrect,
    })),
    players: updated.map(publicParticipant),
  };
  await tx.gameQuestion.update({
    where: { id: question.id },
    data: { result, resolvedAt: await databaseTime(tx) },
  });
  return completeQuestion(tx, game);
};
