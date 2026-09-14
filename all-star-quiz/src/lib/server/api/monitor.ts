import { z } from 'zod';
import { publicSnapshotSchema } from '@/lib/realtime-schema';
import { hostProcedure } from './access';
import { trpc, service } from './trpc';
import { readMonitorSnapshot } from '../game-state';
import { issueRealtimeTicket } from '../realtime-auth';
export const monitorRouter = trpc.router({
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
