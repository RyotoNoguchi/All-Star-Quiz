import { z } from 'zod';
const choice = z.enum(['A', 'B', 'C', 'D']);
export const finishReasonSchema = z.enum([
  'final_question',
  'all_eliminated',
  'all_left',
  'cancelled',
  'expired',
]);
export const publicPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  isHost: z.boolean(),
  isEliminated: z.boolean(),
  eliminationReason: z.enum(['wrong', 'timeout', 'slowest', 'left']).optional(),
  leftAt: z.number().optional(),
});
export const questionResultSchema = z.object({
  questionId: z.string(),
  correctAnswer: choice,
  explanation: z.string().optional(),
  isFinal: z.boolean(),
  winnerId: z.string().optional(),
  answers: z.array(
    z.object({
      playerId: z.string(),
      questionId: z.string(),
      choice,
      answeredAt: z.number(),
      requestId: z.string(),
      acceptanceSequence: z.number().int(),
      responseTime: z.number(),
      isCorrect: z.boolean(),
    })
  ),
  players: z.array(publicPlayerSchema),
});
export const gameResultSchema = z.object({
  gameId: z.string(),
  winnerId: z.string().optional(),
  reason: finishReasonSchema,
  finalRanking: z.array(
    z.object({
      playerId: z.string(),
      rank: z.number().int().positive(),
      survivedQuestions: z.number().int().nonnegative(),
    })
  ),
  totalQuestions: z.number().int().nonnegative(),
  completedAt: z.string(),
  statistics: z.object({
    totalPlayers: z.number().int(),
    totalAnswers: z.number().int(),
    averageResponseTime: z.number(),
    questionStats: z.array(
      z.object({
        questionId: z.string(),
        correctAnswers: z.number().int(),
        totalAnswers: z.number().int(),
        averageResponseTime: z.number(),
        choiceDistribution: z.object({
          A: z.number().int(),
          B: z.number().int(),
          C: z.number().int(),
          D: z.number().int(),
        }),
      })
    ),
  }),
});
