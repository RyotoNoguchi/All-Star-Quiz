import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, readAdminSession } from '@/lib/server/admin';
import { requestIdentity } from '@/lib/server/session';
import { db } from '@/lib/server/db';
import { questionSnapshotSchema } from '@/lib/question-schema';
export const runtime = 'nodejs';
export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id))
    return new NextResponse(null, { status: 404 });
  let allowed = !!(await readAdminSession(
    request.cookies.get(ADMIN_COOKIE)?.value || ''
  ));
  if (!allowed) {
    const identity = await requestIdentity(request);
    if (identity) {
      const games = await db.game.findMany({
        where: {
          expiresAt: { gt: new Date() },
          participants: { some: { userId: identity.userId, leftAt: null } },
        },
        select: { id: true, currentQuestionIndex: true },
      });
      for (const game of games) {
        const current = await db.gameQuestion.findUnique({
          where: {
            gameId_position: {
              gameId: game.id,
              position: game.currentQuestionIndex,
            },
          },
        });
        const question = questionSnapshotSchema.safeParse(current?.snapshot);
        if (
          question.success &&
          Object.values(question.data.choiceImages).some(
            (image) => image?.url === `/api/question-images/${id}`
          )
        ) {
          allowed = true;
          break;
        }
      }
    }
  }
  if (!allowed) return new NextResponse(null, { status: 403 });
  const image = await db.questionImage.findUnique({ where: { id } });
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
