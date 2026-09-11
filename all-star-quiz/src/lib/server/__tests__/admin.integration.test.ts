import { NextRequest } from 'next/server';
import { createTRPCClient, httpLink } from '@trpc/client';
import { GET, POST } from '@/app/api/trpc/[trpc]/route';
import { db } from '../db';
import {
  ADMIN_COOKIE,
  createAdminAccount,
  hashPassword,
  loginAdmin,
  logoutAdmin,
  readAdminSession,
  verifyPassword,
} from '../admin';
import { createGuestSession, hashToken } from '../session';
import { createRoom } from '../rooms';
import { createContext } from '../api/context';
import { adminProcedure, hostProcedure } from '../api/access';
import { trpc } from '../api/trpc';
import type { AppRouter } from '../api/router';

if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_'))
  throw new Error('Use test:db');
beforeEach(async () => {
  await db.game.deleteMany();
  await db.user.deleteMany();
  await db.admin.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});
const password = 'test-only-password-7';
const email = 'admin@example.test';
const testRouter = trpc.router({
  editQuestion: adminProcedure.mutation(() => ({ ok: true })),
  advanceGame: hostProcedure.mutation(({ ctx }) => ctx.hostGame.code),
});
const caller = async (cookie = '') =>
  testRouter.createCaller(
    await createContext(
      new NextRequest('http://localhost:3000/api/trpc', {
        headers: { Origin: 'http://localhost:3000', Cookie: cookie },
      }),
      new Headers()
    )
  );

it('stores salted password hashes and uses revocable expiring admin sessions', async () => {
  const hash = await hashPassword(password);
  expect(hash).not.toContain(password);
  expect(await verifyPassword(password, hash)).toBe(true);
  expect(await verifyPassword('wrong', hash)).toBe(false);
  await createAdminAccount(email, password);
  const session = await loginAdmin(email, password);
  expect(await readAdminSession(session.token)).toEqual(session.admin);
  await db.adminSession.update({
    where: { tokenHash: hashToken(session.token) },
    data: { expiresAt: new Date(0) },
  });
  expect(await readAdminSession(session.token)).toBeNull();
  const again = await loginAdmin(email, password);
  await logoutAdmin(again.token);
  expect(await readAdminSession(again.token)).toBeNull();
});
it('locks out repeated failures and invalidates sessions when an administrator is disabled', async () => {
  await createAdminAccount(email, password);
  for (let i = 0; i < 5; i++)
    await expect(loginAdmin(email, 'wrong')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  await expect(loginAdmin(email, password)).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  await db.admin.update({
    where: { email },
    data: { lockedUntil: new Date(0) },
  });
  const session = await loginAdmin(email, password);
  await db.admin.update({ where: { email }, data: { enabled: false } });
  expect(await readAdminSession(session.token)).toBeNull();
});
it('separates administrator privileges from guest and room-host privileges', async () => {
  await createAdminAccount(email, password);
  const admin = await loginAdmin(email, password);
  const a = await createGuestSession();
  const b = await createGuestSession();
  const roomA = await createRoom('ホストA', a.userId);
  const roomB = await createRoom('ホストB', b.userId);
  await expect((await caller()).editQuestion()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  await expect(
    (await caller(`quiz-participant=${a.token}`)).editQuestion()
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(
    await (await caller(`${ADMIN_COOKIE}=${admin.token}`)).editQuestion()
  ).toEqual({ ok: true });
  await expect(
    (await caller(`${ADMIN_COOKIE}=${admin.token}`)).advanceGame({
      code: roomA.room.code,
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(
    await (
      await caller(`quiz-participant=${a.token}`)
    ).advanceGame({ code: roomA.room.code })
  ).toBe(roomA.room.code);
  await expect(
    (await caller(`quiz-participant=${a.token}`)).advanceGame({
      code: roomB.room.code,
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('issues a secure cookie through the API and removes it on logout', async () => {
  await createAdminAccount(email, password);
  let cookie = '';
  let lastCookie = '';
  const api = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'https://quiz.example/api/trpc',
        headers: () => ({ Origin: 'https://quiz.example', Cookie: cookie }),
        fetch: async (url, options) => {
          const request = new NextRequest(
            new Request(String(url), options as RequestInit)
          );
          const response = await (request.method === 'POST'
            ? POST(request)
            : GET(request));
          const value = response.headers.get('set-cookie');
          if (value) {
            lastCookie = value;
            cookie = value.split(';')[0]!;
          }
          return response;
        },
      }),
    ],
  });
  await expect(api.admin.me.query()).rejects.toMatchObject({
    data: { httpStatus: 401 },
  });
  expect(await api.admin.login.mutate({ email, password })).toMatchObject({
    email,
  });
  expect(lastCookie).toContain('HttpOnly');
  expect(lastCookie).toContain('Secure');
  expect(lastCookie).toContain('SameSite=strict');
  expect(await api.admin.me.query()).toMatchObject({ email });
  await api.admin.logout.mutate();
  await expect(api.admin.me.query()).rejects.toMatchObject({
    data: { httpStatus: 401 },
  });
});
