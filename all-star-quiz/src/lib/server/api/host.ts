import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { hostProcedure } from './access';
import { service, trpc } from './trpc';
import { db } from '../db';
export const hostRouter = trpc.router({
  status: hostProcedure
    .output(
      z.object({
        version: z.number().int(),
        preparedCount: z.number().int(),
        players: z.array(z.object({ id: z.string(), connected: z.boolean() })),
      })
    )
    .query(({ ctx, input }) =>
      service(async () => {
        const game = await db.game.findFirst({
          where: {
            code: input.code,
            expiresAt: { gt: new Date() },
            participants: {
              some: { userId: ctx.identity.userId, isHost: true, leftAt: null },
            },
          },
          include: {
            _count: { select: { questions: true } },
            participants: {
              where: { leftAt: null },
              select: {
                id: true,
                connections: {
                  where: { expiresAt: { gt: new Date() } },
                  select: { id: true },
                },
              },
            },
          },
        });
        if (!game)
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '現在のホストのみ操作できます。',
          });
        return {
          version: game.version,
          preparedCount: game._count.questions,
          players: game.participants.map((player) => ({
            id: player.id,
            connected: player.connections.length > 0,
          })),
        };
      })
    ),
});
