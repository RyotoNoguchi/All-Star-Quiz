import { z } from 'zod';
import {
  commandSchema,
  progressSchema,
  runHostCommand,
  readGameProgress,
  leaveStartedGame,
} from '../game-flow';
import { memberProcedure, service, trpc } from './trpc';
export const gamesRouter = trpc.router({
  status: memberProcedure
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
    .output(progressSchema)
    .query(({ ctx, input }) =>
      service(() => readGameProgress(input.code, ctx.identity.userId))
    ),
  command: memberProcedure
    .input(commandSchema)
    .output(progressSchema)
    .mutation(({ ctx, input }) =>
      service(() => runHostCommand(ctx.identity.userId, input))
    ),
  leave: memberProcedure
    .input(z.object({ gameId: z.string().uuid() }).strict())
    .output(progressSchema)
    .mutation(({ ctx, input }) =>
      service(() => leaveStartedGame(input.gameId, ctx.identity.userId))
    ),
});
