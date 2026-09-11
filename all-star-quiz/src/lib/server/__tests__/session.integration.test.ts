import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/rooms/route';
import { db } from '../db';
import {
  createGuestSession,
  hashToken,
  readSession,
  revokeSession,
  SESSION_COOKIE,
} from '../session';

if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_'))
  throw new Error('Use test:db');
beforeEach(async () => {
  await db.game.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});
const post = (body: object, token?: string) =>
  POST(
    new NextRequest('http://localhost:3000/api/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        ...(token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  );
const get = (code: string, token: string) =>
  GET(
    new NextRequest(`http://localhost:3000/api/rooms?code=${code}`, {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    })
  );

it('uses opaque server-generated sessions, rejects invented tokens and enforces expiry/revocation', async () => {
  expect(await readSession('a'.repeat(64))).toBeNull();
  const guest = await createGuestSession();
  expect((await readSession(guest.token))?.userId).toBe(guest.userId);
  expect((await db.guestSession.findFirstOrThrow()).tokenHash).not.toBe(
    guest.token
  );
  await db.guestSession.update({
    where: { tokenHash: hashToken(guest.token) },
    data: { expiresAt: new Date(0) },
  });
  expect(await readSession(guest.token)).toBeNull();
  const second = await createGuestSession();
  await revokeSession(second.token);
  expect(await readSession(second.token)).toBeNull();
});
it('keeps identity across tabs/rooms and limits departure to the selected room', async () => {
  const created = await post({ action: 'create', name: 'ホスト' });
  const cookie = created.cookies.get(SESSION_COOKIE)!.value;
  expect(created.headers.get('set-cookie')).toContain('HttpOnly');
  expect(created.headers.get('set-cookie')).toContain('SameSite=lax');
  const first = await created.json();
  const second = await (
    await post({ action: 'create', name: 'ホスト', userId: 'forged' }, cookie)
  ).json();
  expect((await (await get(first.room.code, cookie)).json()).playerId).toBe(
    first.playerId
  );
  const again = await (
    await post({ action: 'join', name: '別名', code: first.room.code }, cookie)
  ).json();
  expect(again.playerId).toBe(first.playerId);
  expect(again.room.players).toHaveLength(1);
  await post({ action: 'leave', code: first.room.code }, cookie);
  expect((await get(first.room.code, cookie)).status).toBe(404);
  expect((await get(second.room.code, cookie)).status).toBe(200);
});
it('does not let a client impersonate another participant or leave their room', async () => {
  const response = await post({ action: 'create', name: 'ホスト' });
  const data = await response.json();
  const outsider = await createGuestSession();
  const forbidden = await post(
    { action: 'leave', code: data.room.code, playerId: data.playerId },
    outsider.token
  );
  expect(forbidden.status).toBe(403);
  expect((await get(data.room.code, 'a'.repeat(64))).status).toBe(401);
  expect((await get(data.room.code, outsider.token)).status).toBe(403);
});
it('upgrades legacy cookies once without bringing expired sessions back', async () => {
  const token = 'b'.repeat(64);
  const user = await db.user.create({ data: { tokenHash: hashToken(token) } });
  const [a, b] = await Promise.all([readSession(token), readSession(token)]);
  expect(a?.userId).toBe(user.id);
  expect(b?.userId).toBe(user.id);
  await revokeSession(token);
  expect(await readSession(token)).toBeNull();
});
it('rejects cross-origin mutations and expired sessions', async () => {
  const result = await POST(
    new NextRequest('http://localhost:3000/api/rooms', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
      body: JSON.stringify({ action: 'create', name: 'test' }),
    })
  );
  expect(result.status).toBe(403);
  const guest = await createGuestSession();
  const room = await (
    await post({ action: 'create', name: '名前' }, guest.token)
  ).json();
  await db.guestSession.update({
    where: { tokenHash: hashToken(guest.token) },
    data: { expiresAt: new Date(0) },
  });
  expect((await get(room.room.code, guest.token)).status).toBe(401);
});

it('marks session cookies Secure on HTTPS', async () => {
  const response = await POST(
    new NextRequest('https://quiz.example/api/rooms', {
      method: 'POST',
      headers: {
        Origin: 'https://quiz.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'create', name: '参加者' }),
    })
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toContain('Secure');
});
