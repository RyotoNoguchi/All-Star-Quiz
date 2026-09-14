import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, readAdminSession } from '@/lib/server/admin';
import { db } from '@/lib/server/db';
import {
  MAX_IMAGE_BYTES,
  normalizeQuestionImage,
} from '@/lib/server/question-images';
export const runtime = 'nodejs';
export const POST = async (request: NextRequest) => {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json(
      { error: 'ページを再読み込みしてください。' },
      { status: 403 }
    );
  const admin = await readAdminSession(
    request.cookies.get(ADMIN_COOKIE)?.value || ''
  );
  if (!admin)
    return NextResponse.json(
      { error: '管理者ログインが必要です。' },
      { status: 401 }
    );
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json(
      { error: '画像を選んでください。' },
      { status: 400 }
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return NextResponse.json(
          { error: '画像は2MB以下にしてください。' },
          { status: 413 }
        );
      }
      chunks.push(chunk.value);
    }
    const data = await normalizeQuestionImage(Buffer.concat(chunks));
    const saved = await db.questionImage.create({
      data: { data: new Uint8Array(data) },
    });
    return NextResponse.json(
      { url: `/api/question-images/${saved.id}` },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          '2MB以下・縦横4096ピクセル以下の静止画PNG・JPEG・WebPを選んでください。',
      },
      { status: 400 }
    );
  } finally {
    reader.releaseLock();
  }
};
