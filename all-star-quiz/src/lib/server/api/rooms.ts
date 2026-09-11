import { z } from 'zod';
import { createRoom, joinRoom, leaveRoom, readRoom } from '../rooms';
import { ensureGuest } from './context';
import { memberProcedure, publicProcedure, service, trpc } from './trpc';
const name = z
  .string()
  .trim()
  .min(1, '名前を入力してください。')
  .max(20, '名前は20文字以内です。');
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-F0-9]{6}$/, '6文字のルームコードを入力してください。');
const roomOutput = z.object({
  playerId: z.string(),
  room: z.object({
    code: z.string(),
    phase: z.literal('waiting'),
    createdAt: z.number(),
    players: z.array(
      z.object({ id: z.string(), name: z.string(), isHost: z.boolean() })
    ),
  }),
});
export const roomsRouter = trpc.router({
  create: publicProcedure
    .input(z.object({ name }).strict())
    .output(roomOutput)
    .mutation(({ ctx, input }) =>
      service(async () =>
        createRoom(input.name, (await ensureGuest(ctx)).userId)
      )
    ),
  join: publicProcedure
    .input(z.object({ code, name }).strict())
    .output(roomOutput)
    .mutation(({ ctx, input }) =>
      service(async () =>
        joinRoom(input.code, input.name, (await ensureGuest(ctx)).userId)
      )
    ),
  get: memberProcedure
    .input(z.object({ code }).strict())
    .output(roomOutput)
    .query(({ ctx, input }) =>
      service(() => readRoom(input.code, ctx.identity.userId))
    ),
  leave: memberProcedure
    .input(z.object({ code }).strict())
    .output(z.object({ ok: z.boolean() }))
    .mutation(({ ctx, input }) =>
      service(() => leaveRoom(input.code, ctx.identity.userId))
    ),
});
