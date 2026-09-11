import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ADMIN_COOKIE, readAdminSession, requireHost } from '../admin';
import { memberProcedure, publicProcedure } from './trpc';
export const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const admin = await readAdminSession(
    ctx.request.cookies.get(ADMIN_COOKIE)?.value || ''
  );
  if (!admin)
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: '管理者ログインが必要です。',
    });
  return next({ ctx: { ...ctx, admin } });
});
export const hostProcedure = memberProcedure
  .input(
    z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-F0-9]{6}$/),
      })
      .strict()
  )
  .use(async ({ ctx, input, next }) => {
    const game = await requireHost(input.code, ctx.identity.userId);
    return next({ ctx: { ...ctx, hostGame: game } });
  });
