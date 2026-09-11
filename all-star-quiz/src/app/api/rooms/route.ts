import {
  createGuestSession,
  requestIdentity,
  requireIdentity,
  SessionError,
  setSessionCookie,
} from '@/lib/server/session';
import { type NextRequest, NextResponse } from 'next/server';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  readRoom,
  RoomError,
} from '@/lib/server/rooms';

export const runtime = 'nodejs';
const failure = (error: unknown) => {
  if (error instanceof SessionError)
    return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof RoomError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  console.error('Room request failed', error);
  return NextResponse.json(
    { error: 'ルームに接続できません。もう一度お試しください。' },
    { status: 500 }
  );
};
export const GET = async (request: NextRequest) => {
  try {
    const identity = await requireIdentity(request);
    const result = await readRoom(
      request.nextUrl.searchParams.get('code') || '',
      identity.userId
    );
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
};
export const POST = async (request: NextRequest) => {
  try {
    if (request.headers.get('origin') !== request.nextUrl.origin)
      throw new RoomError('ページを再読み込みしてください。', 403);
    const body = await request.json().catch(() => {
      throw new RoomError('リクエストの形式が不正です。');
    });
    if (!body || typeof body !== 'object')
      throw new RoomError('リクエストの形式が不正です。');
    if (!['create', 'join', 'leave'].includes(body.action))
      throw new RoomError('操作が不正です。');
    const identity =
      body.action === 'leave'
        ? await requireIdentity(request)
        : (await requestIdentity(request)) || (await createGuestSession());
    const code =
      typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const result =
      body.action === 'create'
        ? await createRoom(body.name, identity.userId)
        : body.action === 'join'
          ? await joinRoom(code, body.name, identity.userId)
          : body.action === 'leave'
            ? await leaveRoom(code, identity.userId)
            : null;
    if (!result) throw new RoomError('操作が不正です。');
    const response = NextResponse.json(result);
    setSessionCookie(response, identity, request.nextUrl.protocol === 'https:');
    return response;
  } catch (error) {
    return failure(error);
  }
};
