import { NextResponse, type NextRequest } from 'next/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import { TRPCError } from '@trpc/server';
import { createContext } from '@/lib/server/api/context';
import { appRouter } from '@/lib/server/api/router';
import { apiError } from '@/lib/server/api/trpc';
export const runtime = 'nodejs';
// Compatibility endpoint: route all operations through the same validation and authorization.
const handle = async (request: NextRequest, mutation: boolean) => {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  try {
    const caller = appRouter.createCaller(
      await createContext(request, headers)
    );
    if (!mutation)
      return NextResponse.json(
        await caller.rooms.get({
          code: request.nextUrl.searchParams.get('code') || '',
        }),
        { headers }
      );
    const body = await request.json().catch(() => {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'リクエストの形式が不正です。',
      });
    });
    if (!body || typeof body !== 'object')
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'リクエストの形式が不正です。',
      });
    const result =
      body.action === 'create'
        ? await caller.rooms.create({ name: body.name })
        : body.action === 'join'
          ? await caller.rooms.join({ name: body.name, code: body.code })
          : body.action === 'leave'
            ? await caller.rooms.leave({ code: body.code })
            : null;
    if (!result)
      throw new TRPCError({ code: 'BAD_REQUEST', message: '操作が不正です。' });
    return NextResponse.json(result, { headers });
  } catch (cause) {
    const error = apiError(cause);
    const message =
      error.code === 'INTERNAL_SERVER_ERROR'
        ? '接続できません。しばらく待ってからもう一度お試しください。'
        : error.code === 'BAD_REQUEST'
          ? '入力内容を確認してください。'
          : error.message;
    return NextResponse.json(
      { error: message },
      { status: getHTTPStatusCodeFromError(error), headers }
    );
  }
};
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
