import { z } from 'zod';
import { publicSnapshotSchema } from '@/lib/realtime-schema';
import { hostProcedure } from './access';
import { audioLease } from '../shared-state';
import { requireHost } from '../admin';
import { trpc, service, memberProcedure } from './trpc';
import { readMonitorSnapshot } from '../game-state';
import { issueRealtimeTicket } from '../realtime-auth';
export const monitorRouter = trpc.router({
  audio: memberProcedure
    .input(
      z
        .object({
          code: z.string().regex(/^[A-F0-9]{6}$/),
          owner: z.string().uuid(),
          release: z.boolean().default(false),
        })
        .strict()
    )
    .output(z.object({ granted: z.boolean() }))
    .mutation(({ ctx, input }) =>
      service(async () => {
        const game = await requireHost(input.code, ctx.identity.userId);
        return {
          granted: await audioLease(game.id, input.owner, input.release),
        };
      })
    ),
  snapshot: hostProcedure
    .output(publicSnapshotSchema)
    .query(({ ctx, input }) =>
      service(() => readMonitorSnapshot(input.code, ctx.identity.userId))
    ),
  ticket: hostProcedure
    .output(z.object({ ticket: z.string(), expiresAt: z.number() }))
    .mutation(({ ctx, input }) =>
      service(() =>
        issueRealtimeTicket(
          ctx.identity,
          input.code,
          ctx.request.nextUrl.origin,
          'monitor'
        )
      )
    ),
});
