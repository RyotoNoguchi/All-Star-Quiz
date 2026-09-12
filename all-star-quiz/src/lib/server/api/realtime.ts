import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { issueRealtimeTicket } from '../realtime-auth';
import { memberProcedure, trpc } from './trpc';
export const realtimeRouter = trpc.router({
  ticket: memberProcedure
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
    .output(z.object({ ticket: z.string(), expiresAt: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await issueRealtimeTicket(
          ctx.identity,
          input.code,
          ctx.request.nextUrl.origin
        );
      } catch {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'この部屋に参加し直してください。',
        });
      }
    }),
});
