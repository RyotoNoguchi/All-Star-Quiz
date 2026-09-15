import { z } from 'zod';
import { finishReasonSchema } from './result-schema';
export const personalResultSchema = z.object({
  gameId: z.string().uuid(),
  code: z.string(),
  playerName: z.string(),
  completedAt: z.string(),
  reason: finishReasonSchema,
  totalQuestions: z.number().int().nonnegative(),
  isWinner: z.boolean(),
  rank: z.number().int().positive(),
  survivedQuestions: z.number().int().nonnegative(),
  eliminatedAtQuestion: z.number().int().nonnegative().nullable(),
  eliminationReason: z.enum(['wrong', 'timeout', 'slowest', 'left']).nullable(),
});
export const historyDetailSchema = z.object({
  result: personalResultSchema,
  questions: z.array(
    z.object({
      number: z.number().int().positive(),
      question: z.string(),
      choices: z.object({
        A: z.string(),
        B: z.string(),
        C: z.string(),
        D: z.string(),
      }),
      correctAnswer: z.enum(['A', 'B', 'C', 'D']),
      explanation: z.string().nullable(),
      ownAnswer: z
        .object({
          choice: z.enum(['A', 'B', 'C', 'D']),
          responseTime: z.number(),
          isCorrect: z.boolean(),
        })
        .nullable(),
    })
  ),
});
