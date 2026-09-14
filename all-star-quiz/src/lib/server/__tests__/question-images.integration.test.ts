import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { POST } from '@/app/api/question-images/route';
import { GET } from '@/app/api/question-images/[id]/route';
import { db } from '../db';
import { hashToken, createGuestSession } from '../session';
import { createRoom } from '../rooms';
import { normalizeQuestionImage } from '../question-images';
if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_'))
  throw new Error('Use test:db');
const token = 'b'.repeat(64);
const request = (
  cookie: string,
  bytes: Buffer,
  origin = 'http://localhost:3000'
) =>
  new NextRequest('http://localhost:3000/api/question-images', {
    method: 'POST',
    headers: { cookie, origin },
    body: new Uint8Array(bytes),
  });
beforeEach(async () => {
  await db.game.deleteMany();
  await db.question.deleteMany();
  await db.questionImage.deleteMany();
  await db.user.deleteMany();
  await db.admin.deleteMany();
  await db.admin.create({
    data: {
      email: 'images@example.test',
      passwordHash: 'unused',
      sessions: {
        create: {
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60000),
        },
      },
    },
  });
});
afterAll(async () => {
  await db.$disconnect();
});
it('requires admin and same-origin upload; rejects oversized or disguised files', async () => {
  const bytes = Buffer.from('<svg></svg>');
  expect((await POST(request('', bytes))).status).toBe(401);
  expect(
    (await POST(request(`quiz-admin=${token}`, bytes, 'https://other.test')))
      .status
  ).toBe(403);
  expect((await POST(request(`quiz-admin=${token}`, bytes))).status).toBe(400);
  expect(
    (
      await POST(
        request(`quiz-admin=${token}`, Buffer.alloc(2 * 1024 * 1024 + 1))
      )
    ).status
  ).toBe(413);
  expect(await db.questionImage.count()).toBe(0);
});
it('decodes the actual image and rejects dimensions beyond the limit', async () => {
  const tooWide = await sharp({
    create: { width: 4097, height: 1, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  await expect(normalizeQuestionImage(tooWide)).rejects.toThrow();
});
it('stores normalized image and serves it only to admins or current-question members', async () => {
  const bytes = await sharp({
    create: { width: 12, height: 8, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  const uploaded = await POST(request(`quiz-admin=${token}`, bytes));
  expect(uploaded.status).toBe(200);
  const { url } = await uploaded.json();
  const id = url.split('/').pop()!;
  const read = (cookie = '') =>
    GET(
      new NextRequest(`http://localhost:3000${url}`, { headers: { cookie } }),
      { params: Promise.resolve({ id }) }
    );
  expect((await read()).status).toBe(403);
  const adminImage = await read(`quiz-admin=${token}`);
  expect(adminImage.headers.get('content-type')).toBe('image/webp');
  expect(
    (await sharp(Buffer.from(await adminImage.arrayBuffer())).metadata()).format
  ).toBe('webp');
  const guest = await createGuestSession();
  const room = await createRoom('画像確認', guest.userId);
  const game = await db.game.findUniqueOrThrow({
    where: { code: room.room.code },
  });
  const fields = {
    question: '画像問題',
    choices: { A: '一', B: '二', C: '三', D: '四' },
    answer: 'A' as const,
    type: 'normal' as const,
    timeLimit: 10,
    choiceImages: { A: { url, alt: '赤い画像' } },
    category: null,
    explanation: null,
  };
  const question = await db.question.create({ data: fields });
  await db.gameQuestion.create({
    data: {
      gameId: game.id,
      questionId: question.id,
      position: 0,
      snapshot: { ...fields, id: question.id, version: 0 },
    },
  });
  expect((await read(`quiz-participant=${guest.token}`)).status).toBe(403);
  await db.game.update({
    where: { id: game.id },
    data: { currentQuestionIndex: 0, phase: 'playing' },
  });
  expect((await read(`quiz-participant=${guest.token}`)).status).toBe(200);
  await db.participant.updateMany({
    where: { gameId: game.id },
    data: { leftAt: new Date() },
  });
  expect((await read(`quiz-participant=${guest.token}`)).status).toBe(403);
});
