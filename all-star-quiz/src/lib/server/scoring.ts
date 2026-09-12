import { publicParticipant } from './public-data';
import type { Game, Prisma } from '@prisma/client';
import type { QuestionResult } from '@/types/game';
import { normalEliminations, finalOutcome } from '../scoring';
import { questionSnapshotSchema } from '../question-schema';
import { completeQuestion } from './game-flow';
import { databaseTime } from './time';

export const scoreQuestion = async (
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
  const players = await tx.participant.findMany({
    where: { gameId: game.id },
    orderBy: { joinedOrder: 'asc' },
  });
  const answers = await tx.answer.findMany({
    where: { gameQuestionId: question.id },
    orderBy: { acceptanceSequence: 'asc' },
  });
  const scoringPlayers = players.map((p) => ({
    id: p.id,
    isEliminated: p.isEliminated,
    hasLeft: p.leftAt !== null,
  }));
  const scoringAnswers = answers.map((a) => ({
    playerId: a.participantId,
    isCorrect: a.isCorrect,
    responseTime: a.responseTime,
    acceptanceSequence: a.acceptanceSequence,
  }));
  const outcome =
    snapshot.type === 'final'
      ? finalOutcome(scoringPlayers, scoringAnswers)
      : {
          eliminated: normalEliminations(scoringPlayers, scoringAnswers),
          winnerId: undefined,
        };
  const { eliminated, winnerId } = outcome;
  for (const player of eliminated)
    await tx.participant.update({
      where: { id: player.playerId },
      data: {
        isEliminated: true,
        eliminationReason: player.reason,
        eliminatedAtQuestion: game.currentQuestionIndex,
      },
    });
  const updated = await tx.participant.findMany({
    where: { gameId: game.id },
    orderBy: { joinedOrder: 'asc' },
  });
  const result: QuestionResult = {
    questionId: question.questionId,
    correctAnswer: snapshot.answer,
    isFinal: snapshot.type === 'final',
    ...(winnerId ? { winnerId } : {}),
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
