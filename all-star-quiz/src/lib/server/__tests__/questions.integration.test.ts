import { NextRequest } from 'next/server';
import { closeSharedStore } from '../shared-state';
import { db } from '../db';
import { appRouter } from '../api/router';
import { createContext } from '../api/context';
import { hashToken, createGuestSession } from '../session';
import { createRoom } from '../rooms';
if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_'))
  throw new Error('Use test:db');
const caller = async (cookie = '') =>
  appRouter.createCaller(
    await createContext(
      new NextRequest('http://localhost:3000/api/trpc', {
        headers: { origin: 'http://localhost:3000', cookie },
      }),
      new Headers()
    )
  );
const fields = {
  question: '問題',
  choices: { A: '一', B: '二', C: '三', D: '四' },
  answer: 'A' as const,
  type: 'normal' as const,
  category: '練習',
};
const adminToken = 'a'.repeat(64);
beforeEach(async () => {
  await db.game.deleteMany();
  await db.question.deleteMany();
  await db.user.deleteMany();
  await db.admin.deleteMany();
  await db.admin.create({
    data: {
      email: 'questions@example.test',
      passwordHash: 'unused',
      sessions: {
        create: {
          tokenHash: hashToken(adminToken),
          expiresAt: new Date(Date.now() + 60000),
        },
      },
    },
  });
});
afterAll(async () => {
  closeSharedStore();
  await db.$disconnect();
});
const admin = () => caller(`quiz-admin=${adminToken}`);
it('requires administrator access for every question CRUD operation', async () => {
  const guest = await createGuestSession();
  const api = await caller(`quiz-participant=${guest.token}`);
  await expect(api.questions.create(fields)).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  await expect(api.questions.list({})).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  await expect(api.questions.get({ id: 'missing' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  await expect(
    api.questions.update({ ...fields, id: 'missing', version: 0 })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  await expect(
    api.questions.delete({ id: 'missing', version: 0 })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
it('validates choices and images, filters categories, and detects stale edits and deletion', async () => {
  const api = await admin();
  await expect(
    api.questions.create({ ...fields, choices: { ...fields.choices, D: ' ' } })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(
    api.questions.create({
      ...fields,
      choiceImages: { A: { url: 'javascript:alert(1)', alt: '一' } },
    })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  const q = await api.questions.create({
    ...fields,
    explanation: '説明',
    choiceImages: { A: { url: 'https://example.test/a.png', alt: '一の画像' } },
  });
  expect(q).not.toHaveProperty('createdAt');
  expect((await api.questions.get({ id: q.id })).choiceImages.A?.alt).toBe(
    '一の画像'
  );
  await api.questions.create({ ...fields, category: '別' });
  expect(
    await api.questions.list({ category: '練習', limit: 1 })
  ).toMatchObject({ total: 1, items: [{ id: q.id }] });
  const updated = await api.questions.update({ ...q, question: '更新' });
  expect(updated.version).toBe(1);
  await expect(api.questions.update(q)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(
    api.questions.delete({ id: q.id, version: 0 })
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await api.questions.delete({ id: q.id, version: 1 });
  await expect(api.questions.get({ id: q.id })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect((await api.questions.list({ category: '練習' })).total).toBe(0);
});
it('prepares a unique category-filtered set with a final last and preserves snapshots after editing/deletion', async () => {
  const api = await admin();
  const normal = await api.questions.create(fields);
  await api.questions.create({ ...fields, type: 'final' });
  await api.questions.create({ ...fields, category: '別' });
  const guest = await createGuestSession();
  const room = await createRoom('ホスト', guest.userId);
  const host = await caller(`quiz-participant=${guest.token}`);
  const input = { code: room.room.code, count: 2, category: '練習' };
  expect(await host.questions.prepareGame(input)).toEqual({
    count: 2,
    version: 1,
  });
  const saved = await db.gameQuestion.findMany({
    orderBy: { position: 'asc' },
  });
  expect(new Set(saved.map((q) => q.questionId)).size).toBe(2);
  expect(saved[1]?.snapshot).toMatchObject({ type: 'final', category: '練習' });
  await api.questions.update({ ...normal, question: '編集後' });
  await api.questions.delete({ id: normal.id, version: 1 });
  expect(
    await db.gameQuestion.findMany({ orderBy: { position: 'asc' } })
  ).toEqual(saved);
  await expect(host.questions.prepareGame(input)).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  expect(
    await db.gameQuestion.findMany({ orderBy: { position: 'asc' } })
  ).toEqual(saved);
  const other = await createGuestSession();
  await expect(
    (await caller(`quiz-participant=${other.token}`)).questions.prepareGame(
      input
    )
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await db.game.update({
    where: { code: input.code },
    data: { phase: 'playing' },
  });
  await expect(
    host.questions.prepareGame({ ...input, count: 1 })
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('requires a final question and supports a final-only game', async () => {
  const api = await admin();
  const guest = await createGuestSession();
  const room = await createRoom('ホスト', guest.userId);
  const host = await caller(`quiz-participant=${guest.token}`);
  const input = { code: room.room.code, count: 1 };
  await api.questions.create(fields);
  await expect(host.questions.prepareGame(input)).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  await api.questions.create({ ...fields, type: 'final' });
  expect(await host.questions.prepareGame(input)).toMatchObject({ count: 1 });
});
it('exposes prepared count and current connections only to the current host', async () => {
  const guest = await createGuestSession();
  const room = await createRoom('ホスト', guest.userId);
  const host = await caller(`quiz-participant=${guest.token}`);
  const status = await host.host.status({ code: room.room.code });
  expect(status.preparedCount).toBe(0);
  expect(status.players).toEqual([{ id: room.playerId, connected: false }]);
  await db.realtimeConnection.create({
    data: {
      id: 'host-connection',
      participantId: room.playerId,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  expect(
    (await host.host.status({ code: room.room.code })).players[0]?.connected
  ).toBe(true);
  const other = await createGuestSession();
  await expect(
    (await caller(`quiz-participant=${other.token}`)).host.status({
      code: room.room.code,
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await db.participant.update({
    where: { id: room.playerId },
    data: { isHost: false },
  });
  await expect(
    host.host.status({ code: room.room.code })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('restricts audio ownership to the current host', async () => {
  const guest = await createGuestSession();
  const room = await createRoom('音声ホスト', guest.userId);
  const host = await caller(`quiz-participant=${guest.token}`);
  const owner = crypto.randomUUID();
  expect(await host.monitor.audio({ code: room.room.code, owner })).toEqual({
    granted: true,
  });
  const other = await createGuestSession();
  await expect(
    (await caller(`quiz-participant=${other.token}`)).monitor.audio({
      code: room.room.code,
      owner: crypto.randomUUID(),
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await db.participant.update({
    where: { id: room.playerId },
    data: { isHost: false },
  });
  await expect(
    host.monitor.audio({ code: room.room.code, owner })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
