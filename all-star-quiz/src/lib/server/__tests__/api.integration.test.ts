import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/trpc/[trpc]/route';
import type { AppRouter } from '../api/router';
import { db } from '../db';

if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_'))
  throw new Error('Use test:db');
beforeEach(async () => {
  await db.game.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});
const client = (origin = 'http://localhost:3000') => {
  let cookie = '';
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://localhost:3000/api/trpc',
        headers: () => ({ Origin: origin, Cookie: cookie }),
        fetch: async (url, options) => {
          const request = new NextRequest(
            new Request(String(url), options as RequestInit)
          );
          const response = await (request.method === 'POST'
            ? POST(request)
            : GET(request));
          const nextCookie = response.headers.get('set-cookie');
          if (nextCookie) cookie = nextCookie.split(';')[0]!;
          return response;
        },
      }),
    ],
  });
};
it('uses a typed HTTP client for create, join, restore and leave without exposing internal fields', async () => {
  const host = client();
  const guest = client();
  const created = await host.rooms.create.mutate({ name: 'ホスト' });
  const joined = await guest.rooms.join.mutate({
    name: '参加者',
    code: created.room.code.toLowerCase(),
  });
  expect(joined.room.players).toHaveLength(2);
  expect(
    (await host.rooms.get.query({ code: created.room.code })).playerId
  ).toBe(created.playerId);
  expect(Object.keys(joined.room.players[0]!).sort()).toEqual([
    'id',
    'isHost',
    'name',
  ]);
  await guest.rooms.leave.mutate({ code: created.room.code });
  expect(
    (await host.rooms.get.query({ code: created.room.code })).room.players
  ).toHaveLength(1);
});
it('rejects invalid inputs before issuing a guest session', async () => {
  const api = client();
  await expect(api.rooms.create.mutate({ name: ' ' })).rejects.toMatchObject({
    data: { code: 'BAD_REQUEST', httpStatus: 400 },
  });
  const injected = { name: 'テスト', userId: 'victim' };
  await expect(api.rooms.create.mutate(injected)).rejects.toMatchObject({
    data: { code: 'BAD_REQUEST' },
  });
  expect(await db.guestSession.count()).toBe(0);
});
it('reports unauthenticated, forbidden and not-found conditions consistently', async () => {
  await expect(
    client().rooms.get.query({ code: 'ABCDEF' })
  ).rejects.toMatchObject({ data: { httpStatus: 401 } });
  await expect(
    client('https://attacker.example').rooms.create.mutate({ name: '名前' })
  ).rejects.toMatchObject({ data: { httpStatus: 403 } });
  const host = client();
  const stranger = client();
  const room = await host.rooms.create.mutate({ name: 'ホスト' });
  await stranger.rooms.create.mutate({ name: '別人' });
  await expect(
    stranger.rooms.get.query({ code: room.room.code })
  ).rejects.toMatchObject({ data: { httpStatus: 403 } });
  await host.rooms.leave.mutate({ code: room.room.code });
  await expect(
    host.rooms.get.query({ code: room.room.code })
  ).rejects.toMatchObject({ data: { httpStatus: 404 } });
});
it('does not disclose exception details or stacks on unexpected failures', async () => {
  const api = client();
  const room = await api.rooms.create.mutate({ name: '名前' });
  const spy = vi
    .spyOn(db, '$transaction')
    .mockRejectedValueOnce(new Error('database-password-secret'));
  try {
    await api.rooms.get.query({ code: room.room.code });
    throw new Error('Expected failure');
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCClientError);
    expect(JSON.stringify(error)).not.toContain('database-password-secret');
    expect(error).toMatchObject({ data: { httpStatus: 500 } });
  } finally {
    spy.mockRestore();
  }
});
