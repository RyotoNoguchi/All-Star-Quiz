import type { Game, Prisma } from '@prisma/client';
import type { GameResult } from '@/types/game';
import { finishReasonSchema, questionResultSchema } from '../result-schema';
import { databaseTime } from './time';

export const persistGameResult = async (
  tx: Prisma.TransactionClient,
  game: Game
) => {
  if (
    game.phase !== 'finished' ||
    (await tx.gameResult.findUnique({ where: { gameId: game.id } }))
  )
    return;
  const players = await tx.participant.findMany({
    where: { gameId: game.id },
    orderBy: { joinedOrder: 'asc' },
  });
  const questions = await tx.gameQuestion.findMany({
    where: { gameId: game.id },
    orderBy: { position: 'asc' },
    include: { answers: true },
  });
  const resolved = questions
    .filter((q) => q.result !== null)
    .map((q) => ({ ...q, result: questionResultSchema.parse(q.result) }));
  const last = resolved[resolved.length - 1]?.result;
  const winnerId =
    game.finishReason === 'final_question' ? last?.winnerId : undefined;
  const ranked = players
    .map((player, joinOrder) => {
      const survivedQuestions = resolved.filter((q) =>
        q.result.players.some(
          (p) => p.id === player.id && !p.isEliminated && p.leftAt === undefined
        )
      ).length;
      const eliminated = resolved.find((q) =>
        q.result.players.some(
          (p) =>
            p.id === player.id && (p.isEliminated || p.leftAt !== undefined)
        )
      );
      const reached =
        player.eliminatedAtQuestion ??
        eliminated?.position ??
        game.currentQuestionIndex;
      const tier =
        player.id === winnerId
          ? 0
          : game.finishReason === 'final_question' &&
              !player.isEliminated &&
              !player.leftAt
            ? 1
            : 2;
      return {
        playerId: player.id,
        survivedQuestions,
        reached,
        tier,
        joinOrder,
      };
    })
    .sort(
      (a, b) =>
        a.tier - b.tier || b.reached - a.reached || a.joinOrder - b.joinOrder
    );
  let rank = 1;
  const finalRanking = ranked.map((player, index) => {
    const previous = ranked[index - 1];
    if (
      previous &&
      (previous.tier !== player.tier || previous.reached !== player.reached)
    )
      rank = index + 1;
    return {
      playerId: player.playerId,
      survivedQuestions: player.survivedQuestions,
      rank,
    };
  });
  const allAnswers = questions.flatMap((q) => q.answers);
  const average = (values: { responseTime: number }[]) =>
    values.length
      ? values.reduce((sum, a) => sum + a.responseTime, 0) / values.length
      : 0;
  const statistics = {
    totalPlayers: players.length,
    totalAnswers: allAnswers.length,
    averageResponseTime: average(allAnswers),
    // Unresolved questions (e.g. cancelled mid-round) must not reveal correctness.
    questionStats: resolved.map((q) => ({
      questionId: q.questionId,
      correctAnswers: q.answers.filter((a) => a.isCorrect).length,
      totalAnswers: q.answers.length,
      averageResponseTime: average(q.answers),
      choiceDistribution: q.answers.reduce(
        (counts, answer) => ({
          ...counts,
          [answer.choice]: counts[answer.choice] + 1,
        }),
        { A: 0, B: 0, C: 0, D: 0 }
      ),
    })),
  };
  const completedAt = await databaseTime(tx);
  const reason = finishReasonSchema.parse(game.finishReason);
  const result: GameResult = {
    gameId: game.id,
    ...(winnerId ? { winnerId } : {}),
    reason,
    finalRanking,
    totalQuestions: Math.max(0, game.currentQuestionIndex + 1),
    completedAt: completedAt.toISOString(),
    statistics,
  };
  await tx.gameResult.create({
    data: {
      gameId: game.id,
      winnerId: winnerId ?? null,
      reason,
      ranking: finalRanking,
      totalQuestions: result.totalQuestions,
      statistics,
      completedAt,
    },
  });
  await tx.personalResult.createMany({
    data: players.map((player) => {
      const ranking = finalRanking.find(
        (entry) => entry.playerId === player.id
      )!;
      return {
        gameId: game.id,
        userId: player.userId,
        playerId: player.id,
        playerName: player.name,
        code: game.code,
        completedAt,
        reason,
        totalQuestions: result.totalQuestions,
        isWinner: player.id === winnerId,
        rank: ranking.rank,
        survivedQuestions: ranking.survivedQuestions,
        eliminatedAtQuestion:
          player.eliminatedAtQuestion === null
            ? null
            : Math.max(0, player.eliminatedAtQuestion + 1),
        eliminationReason: player.eliminationReason,
      };
    }),
  });
  const payload = { result, ...(last ? { lastResult: last } : {}) };
  await tx.gameEventRecord.create({
    data: {
      gameId: game.id,
      version: game.version,
      type: 'GAME_ENDED',
      payload,
      createdAt: completedAt,
    },
  });
};
