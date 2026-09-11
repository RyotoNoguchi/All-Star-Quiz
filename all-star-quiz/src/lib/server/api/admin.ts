import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ADMIN_COOKIE, loginAdmin, logoutAdmin } from '../admin';
import { adminProcedure, hostProcedure } from './access';
import { publicProcedure, service, trpc } from './trpc';
const output = z.object({ id: z.string(), email: z.string() });
export const adminRouter = trpc.router({
  login: publicProcedure
    .input(
      z
        .object({
          email: z.email().transform((value) => value.toLowerCase()),
          password: z.string().min(1).max(128),
        })
        .strict()
    )
    .output(output)
    .mutation(({ ctx, input }) =>
      service(async () => {
        const session = await loginAdmin(input.email, input.password);
        const response = new NextResponse();
        response.cookies.set(ADMIN_COOKIE, session.token, {
          httpOnly: true,
          sameSite: 'strict',
          secure: ctx.request.nextUrl.protocol === 'https:',
          path: '/',
          expires: session.expiresAt,
        });
        ctx.resHeaders.set('set-cookie', response.headers.get('set-cookie')!);
        return session.admin;
      })
    ),
  me: adminProcedure.output(output).query(({ ctx }) => ctx.admin),
  logout: publicProcedure.mutation(({ ctx }) =>
    service(async () => {
      await logoutAdmin(ctx.request.cookies.get(ADMIN_COOKIE)?.value || '');
      const response = new NextResponse();
      response.cookies.set(ADMIN_COOKIE, '', {
        httpOnly: true,
        sameSite: 'strict',
        secure: ctx.request.nextUrl.protocol === 'https:',
        path: '/',
        expires: new Date(0),
      });
      ctx.resHeaders.set('set-cookie', response.headers.get('set-cookie')!);
      return { ok: true };
    })
  ),
  hostAccess: hostProcedure.query(({ ctx }) => ctx.hostGame),
});
