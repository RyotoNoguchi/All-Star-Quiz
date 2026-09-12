import { questionFields } from '@/lib/question-schema';
import { randomInt } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { adminProcedure } from './access';
import { memberProcedure, service, trpc } from './trpc';

const id = z.string().min(1).max(128);
const category = z.string().trim().min(1).max(50).optional();
const version = z.number().int().nonnegative();
const output = questionFields.extend({ id, version }).strip();
const conflict = () =>
  new TRPCError({
    code: 'CONFLICT',
    message: '問題が更新または削除されています。一覧を読み直してください。',
  });
const shuffle = <T>(items: T[]) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};
export const questionsRouter = trpc.router({
  create: adminProcedure
    .input(questionFields)
    .output(output)
    .mutation(({ input }) =>
      service(async () =>
        output.parse(await db.question.create({ data: input }))
      )
    ),
  get: adminProcedure
    .input(z.object({ id }).strict())
    .output(output)
    .query(({ input }) =>
      service(async () => {
        const question = await db.question.findFirst({
          where: { id: input.id, archivedAt: null },
        });
        if (!question)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '問題が見つかりません。',
          });
        return output.parse(question);
      })
    ),
  list: adminProcedure
    .input(
      z
        .object({
          category,
          offset: z.number().int().nonnegative().default(0),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .strict()
    )
    .output(z.object({ items: z.array(output), total: z.number() }))
    .query(({ input }) =>
      service(async () => {
        const where = {
          archivedAt: null,
          ...(input.category ? { category: input.category } : {}),
        };
        const [items, total] = await db.$transaction([
          db.question.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            skip: input.offset,
            take: input.limit,
          }),
          db.question.count({ where }),
        ]);
        return { items: items.map((item) => output.parse(item)), total };
      })
    ),
  update: adminProcedure
    .input(questionFields.extend({ id, version }).strict())
    .output(output)
    .mutation(({ input }) =>
      service(async () => {
        const { id, version, ...data } = input;
        return db.$transaction(async (tx) => {
          const updated = await tx.question.updateMany({
            where: { id, version, archivedAt: null },
            data: { ...data, version: { increment: 1 } },
          });
          if (!updated.count) throw conflict();
          return output.parse(
            await tx.question.findUniqueOrThrow({ where: { id } })
          );
        });
      })
    ),
  delete: adminProcedure
    .input(z.object({ id, version }).strict())
    .output(z.object({ ok: z.boolean() }))
    .mutation(({ input }) =>
      service(async () => {
        const result = await db.question.updateMany({
          where: { ...input, archivedAt: null },
          data: { archivedAt: new Date(), version: { increment: 1 } },
        });
        if (!result.count) throw conflict();
        return { ok: true };
      })
    ),
  prepareGame: memberProcedure
    .input(
      z
        .object({
          code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-F0-9]{6}$/),
          count: z.number().int().min(1).max(50),
          category,
        })
        .strict()
    )
    .output(z.object({ count: z.number(), version: z.number() }))
    .mutation(({ ctx, input }) =>
      service(() =>
        db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Game" WHERE code = ${input.code} FOR UPDATE`;
          const game = await tx.game.findUnique({
            where: { code: input.code },
            include: {
              participants: {
                where: {
                  userId: ctx.identity.userId,
                  isHost: true,
                  leftAt: null,
                },
              },
            },
          });
          if (
            !game ||
            !game.participants.length ||
            game.expiresAt <= new Date()
          )
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: '有効な部屋のホストのみ操作できます。',
            });
          if (game.phase !== 'waiting')
            throw new TRPCError({
              code: 'CONFLICT',
              message: '開始後は問題を変更できません。',
            });
          const pool = await tx.question.findMany({
            where: {
              archivedAt: null,
              ...(input.category ? { category: input.category } : {}),
            },
          });
          const normal = shuffle(pool.filter((q) => q.type === 'normal'));
          const final = shuffle(pool.filter((q) => q.type === 'final'))[0];
          if (!final || normal.length < input.count - 1)
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message:
                '問題が不足しています。通常問題と最終問題を追加するか、出題数・カテゴリを変更してください。',
            });
          const selected = [...normal.slice(0, input.count - 1), final];
          await tx.gameQuestion.deleteMany({ where: { gameId: game.id } });
          await tx.gameQuestion.createMany({
            data: selected.map((q, position) => ({
              gameId: game.id,
              questionId: q.id,
              position,
              snapshot: output.parse(q),
            })),
          });
          const updated = await tx.game.update({
            where: { id: game.id },
            data: { version: { increment: 1 } },
          });
          return { count: selected.length, version: updated.version };
        })
      )
    ),
});
