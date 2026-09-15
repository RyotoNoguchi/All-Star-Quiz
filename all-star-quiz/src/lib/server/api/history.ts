import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { PersonalResult } from '@prisma/client';
import {
  personalResultSchema,
  historyDetailSchema,
} from '@/lib/history-schema';
import { questionSnapshotSchema } from '@/lib/question-schema';
import { questionResultSchema } from '@/lib/result-schema';
import { db } from '../db';
import { memberProcedure, service, trpc } from './trpc';
const view = (result: PersonalResult) =>
  personalResultSchema.parse({
    ...result,
    completedAt: result.completedAt.toISOString(),
  });
export const historyRouter = trpc.router({
  list: memberProcedure
    .input(
      z
        .object({
          offset: z.number().int().min(0).max(100000).default(0),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .strict()
    )
    .output(
      z.object({
        items: z.array(personalResultSchema),
        total: z.number().int(),
        sessionExpiresAt: z.string(),
      })
    )
    .query(({ ctx, input }) =>
      service(async () => {
        const where = { userId: ctx.identity.userId };
        const [items, total] = await db.$transaction(
          [
            db.personalResult.findMany({
              where,
              orderBy: [{ completedAt: 'desc' }, { gameId: 'desc' }],
              skip: input.offset,
              take: input.limit,
            }),
            db.personalResult.count({ where }),
          ],
          { isolationLevel: 'RepeatableRead' }
        );
        return {
          items: items.map(view),
          total,
          sessionExpiresAt: ctx.identity.expiresAt.toISOString(),
        };
      })
    ),
  detail: memberProcedure
    .input(z.object({ gameId: z.string().uuid() }).strict())
    .output(historyDetailSchema)
    .query(({ ctx, input }) =>
      service(async () => {
        const result = await db.personalResult.findUnique({
          where: {
            gameId_userId: {
              gameId: input.gameId,
              userId: ctx.identity.userId,
            },
          },
        });
        if (!result)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'この履歴は見つかりません。',
          });
        const questions = await db.gameQuestion.findMany({
          where: {
            gameId: result.gameId,
            resolvedAt: { not: null },
            position: {
              lt: result.eliminatedAtQuestion ?? result.totalQuestions,
            },
          },
          orderBy: { position: 'asc' },
        });
        return {
          result: view(result),
          questions: questions.flatMap((question) => {
            const published = questionResultSchema.safeParse(question.result);
            if (!published.success) return [];
            const snapshot = questionSnapshotSchema.parse(question.snapshot);
            const own = published.data.answers.find(
              (answer) => answer.playerId === result.playerId
            );
            return [
              {
                number: question.position + 1,
                question: snapshot.question,
                choices: snapshot.choices,
                correctAnswer: published.data.correctAnswer,
                explanation: published.data.explanation ?? null,
                ownAnswer: own
                  ? {
                      choice: own.choice,
                      responseTime: own.responseTime,
                      isCorrect: own.isCorrect,
                    }
                  : null,
              },
            ];
          }),
        };
      })
    ),
});
