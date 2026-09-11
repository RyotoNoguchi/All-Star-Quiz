import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import type { Context } from './context';
import { RoomError } from '../rooms';
import { SessionError } from '../session';

export const apiError = (error: unknown): TRPCError => {
  if (error instanceof TRPCError) return error;
  if (error instanceof SessionError)
    return new TRPCError({ code: 'UNAUTHORIZED', message: error.message });
  if (error instanceof RoomError) {
    const code =
      error.status === 403
        ? 'FORBIDDEN'
        : error.status === 404
          ? 'NOT_FOUND'
          : error.status === 409
            ? 'CONFLICT'
            : error.status === 503
              ? 'SERVICE_UNAVAILABLE'
              : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: '接続できません。しばらく待ってからもう一度お試しください。',
    cause: error,
  });
};
export const service = async <T>(action: () => Promise<T>) => {
  try {
    return await action();
  } catch (error) {
    throw apiError(error);
  }
};
export const trpc = initTRPC.context<Context>().create({
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    message:
      error.code === 'INTERNAL_SERVER_ERROR'
        ? '接続できません。しばらく待ってからもう一度お試しください。'
        : error.cause instanceof ZodError
          ? '入力内容を確認してください。'
          : shape.message,
    data: {
      code: shape.data.code,
      httpStatus: shape.data.httpStatus,
      path: shape.data.path,
      fieldErrors:
        error.cause instanceof ZodError
          ? error.cause.flatten().fieldErrors
          : null,
    },
  }),
});
export const publicProcedure = trpc.procedure.use(
  async ({ ctx, type, next }) => {
    if (
      type === 'mutation' &&
      ctx.request.headers.get('origin') !== ctx.request.nextUrl.origin
    )
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'ページを再読み込みしてください。',
      });
    return next();
  }
);
export const memberProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.identity) throw apiError(new SessionError());
  return next({ ctx: { ...ctx, identity: ctx.identity } });
});
