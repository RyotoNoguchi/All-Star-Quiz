import { randomBytes } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  readRoom,
  RoomError,
} from '@/lib/server/rooms';

export const runtime = 'nodejs';
const COOKIE = 'quiz-participant';
const sessionToken = (request: NextRequest) => {
  const value = request.cookies.get(COOKIE)?.value || '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
};
const failure = (error: unknown) => {
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
    const result = await readRoom(
      request.nextUrl.searchParams.get('code') || '',
      sessionToken(request)
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
    const token = sessionToken(request) || randomBytes(32).toString('hex');
    const code =
      typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const result =
      body.action === 'create'
        ? await createRoom(body.name, token)
        : body.action === 'join'
          ? await joinRoom(code, body.name, token)
          : body.action === 'leave'
            ? await leaveRoom(code, token)
            : null;
    if (!result) throw new RoomError('操作が不正です。');
    const response = NextResponse.json(result);
    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 86400,
    });
    return response;
  } catch (error) {
    return failure(error);
  }
};
