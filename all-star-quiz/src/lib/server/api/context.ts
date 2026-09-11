import { NextResponse, type NextRequest } from 'next/server';
import {
  createGuestSession,
  requestIdentity,
  setSessionCookie,
} from '../session';
export const createContext = async (
  request: NextRequest,
  resHeaders: Headers
) => ({
  request,
  resHeaders,
  identity: await requestIdentity(request),
});
export type Context = Awaited<ReturnType<typeof createContext>>;
export const ensureGuest = async (ctx: Context) => {
  ctx.identity ??= await createGuestSession();
  const response = new NextResponse();
  setSessionCookie(
    response,
    ctx.identity,
    ctx.request.nextUrl.protocol === 'https:'
  );
  ctx.resHeaders.set('set-cookie', response.headers.get('set-cookie')!);
  return ctx.identity;
};
