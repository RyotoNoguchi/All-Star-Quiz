import { randomUUID } from 'node:crypto';
import { runHostCommand } from '../game-flow';
import { io, type Socket } from 'socket.io-client';
import { NextRequest } from 'next/server';
import { startRealtimeServer } from '../../../server/realtime';
import { issueRealtimeTicket, verifyRealtimeTicket } from '../realtime-auth';
import {
  createGuestSession,
  revokeSession,
  type GuestIdentity,
} from '../session';
import { createRoom, joinRoom, leaveRoom } from '../rooms';
import { closeSharedStore } from '../shared-state';
import { db } from '../db';
import { appRouter } from '../api/router';
import { createContext } from '../api/context';
if (
  !process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_') ||
  !process.env.REDIS_URL ||
  !process.env.QUIZ_REDIS_PREFIX
)
  throw new Error('Use test:db');
const previousSecret = process.env.REALTIME_TICKET_SECRET;
const origin = 'http://localhost:3000';
let a: Awaited<ReturnType<typeof startRealtimeServer>>;
let b: typeof a;
const sockets: Socket[] = [];
beforeAll(async () => {
  process.env.REALTIME_TICKET_SECRET =
    'test-only-realtime-secret-with-at-least-32-characters';
  const options = {
    port: 0,
    host: '127.0.0.1',
    redisUrl: process.env.REDIS_URL!,
    origins: [origin],
    prefix: `${process.env.QUIZ_REDIS_PREFIX}:transport`,
  };
  a = await startRealtimeServer(options);
  b = await startRealtimeServer(options);
});
beforeEach(async () => {
  await db.game.deleteMany();
  await db.user.deleteMany();
});
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});
afterAll(async () => {
  await Promise.all([a?.close(), b?.close()]);
  closeSharedStore();
  await db.$disconnect();
  if (previousSecret === undefined) delete process.env.REALTIME_TICKET_SECRET;
  else process.env.REALTIME_TICKET_SECRET = previousSecret;
});
const connect = (port: number, ticket: string, requestOrigin = origin) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: { ticket },
      extraHeaders: { origin: requestOrigin },
      reconnection: false,
      timeout: 2000,
    });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
const ticket = async (guest: GuestIdentity, code: string) =>
  (await issueRealtimeTicket(guest, code, origin)).ticket;
const event = <T>(socket: Socket, name: string) =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Missing ${name}`)),
      2000
    );
    socket.once(name, (value: T) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
it('issues tickets only for authenticated room members and rejects tampering, origin changes, and replay', async () => {
  const guest = await createGuestSession();
  const room = await createRoom('ホスト', guest.userId);
  const caller = appRouter.createCaller(
    await createContext(
      new NextRequest(`${origin}/api/trpc`, {
        headers: { origin, cookie: `quiz-participant=${guest.token}` },
      }),
      new Headers()
    )
  );
  const issued = await caller.realtime.ticket({ code: room.room.code });
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 60001);
  try {
    await expect(verifyRealtimeTicket(issued.ticket, origin)).rejects.toThrow();
  } finally {
    clock.mockRestore();
  }
  await expect(
    verifyRealtimeTicket(`${issued.ticket}x`, origin)
  ).rejects.toThrow();
  await expect(
    verifyRealtimeTicket(issued.ticket, 'https://wrong.test')
  ).rejects.toThrow();
  await expect(
    connect(a.port, issued.ticket, 'https://wrong.test')
  ).rejects.toThrow();
  const socket = await connect(a.port, issued.ticket);
  expect(socket.connected).toBe(true);
  await expect(connect(b.port, issued.ticket)).rejects.toThrow('UNAUTHORIZED');
  await expect(
    issueRealtimeTicket(await createGuestSession(), room.room.code, origin)
  ).rejects.toThrow();
});
it('isolates rooms and distributes notifications between two server instances', async () => {
  const guest = await createGuestSession();
  const room = await createRoom('共有ホスト', guest.userId);
  const peer = await createGuestSession();
  await joinRoom(room.room.code, '同じ部屋', peer.userId);
  const stranger = await createGuestSession();
  const other = await createRoom('別の部屋', stranger.userId);
  const [first, second, third] = await Promise.all([
    connect(a.port, await ticket(guest, room.room.code)),
    connect(b.port, await ticket(peer, room.room.code)),
    connect(b.port, await ticket(stranger, other.room.code)),
  ]);
  const received: unknown[] = [];
  third.on('ROOM_UPDATED', (payload) => received.push(payload));
  const firstEvent = event(first, 'ROOM_UPDATED');
  const secondEvent = event(second, 'ROOM_UPDATED');
  const game = await db.game.findUniqueOrThrow({
    where: { code: room.room.code },
  });
  await a.notifyRoom(game.id);
  expect(await firstEvent).toEqual({ version: game.version });
  expect(await secondEvent).toEqual({ version: game.version });
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(received).toEqual([]);
  const response = await second.timeout(2000).emitWithAck('SYNC_ROOM', {});
  expect(response).toMatchObject({
    ok: true,
    state: {
      playerId: (
        await db.participant.findUniqueOrThrow({
          where: { gameId_userId: { gameId: game.id, userId: peer.userId } },
        })
      ).id,
      room: { code: room.room.code },
    },
  });
  expect(JSON.stringify(response)).not.toContain('sessionHash');
});
it('rejects room injection and unknown commands, and disconnects a revoked participant', async () => {
  const guest = await createGuestSession();
  const room = await createRoom('ホスト', guest.userId);
  const socket = await connect(a.port, await ticket(guest, room.room.code));
  expect(
    await socket.timeout(2000).emitWithAck('SYNC_ROOM', { code: 'ABCDEF' })
  ).toEqual({ ok: false, code: 'BAD_REQUEST' });
  expect(await socket.timeout(2000).emitWithAck('START_GAME', {})).toEqual({
    ok: false,
    code: 'BAD_REQUEST',
  });
  await revokeSession(guest.token);
  const disconnected = event(socket, 'disconnect');
  expect(await socket.timeout(2000).emitWithAck('SYNC_ROOM', {})).toEqual({
    ok: false,
    code: 'UNAUTHORIZED',
  });
  await disconnected;
  expect(socket.connected).toBe(false);
});
it('requires fresh tickets on reconnect and rejects expired sessions and departed members', async () => {
  const guest = await createGuestSession();
  const room = await createRoom('ホスト', guest.userId);
  const issued = await ticket(guest, room.room.code);
  const socket = await connect(a.port, issued);
  socket.close();
  const again = await connect(b.port, await ticket(guest, room.room.code));
  expect(again.connected).toBe(true);
  again.close();
  const departing = await ticket(guest, room.room.code);
  await leaveRoom(room.room.code, guest.userId);
  await expect(connect(a.port, departing)).rejects.toThrow('UNAUTHORIZED');
  const room2 = await createRoom('再参加', guest.userId);
  const expiring = await ticket(guest, room2.room.code);
  await db.guestSession.updateMany({
    where: { userId: guest.userId },
    data: { expiresAt: new Date(0) },
  });
  await expect(connect(a.port, expiring)).rejects.toThrow('UNAUTHORIZED');
});
it('serves health checks and rejects connections without tickets', async () => {
  expect((await fetch(`http://127.0.0.1:${a.port}/health`)).status).toBe(200);
  expect((await fetch(`http://127.0.0.1:${a.port}/missing`)).status).toBe(404);
  await expect(connect(a.port, '')).rejects.toThrow('UNAUTHORIZED');
});

it('cleans up Redis connections when the listening port is already occupied', async () => {
  await expect(
    startRealtimeServer({
      port: a.port,
      host: '127.0.0.1',
      redisUrl: process.env.REDIS_URL!,
      origins: [origin],
      prefix: `${process.env.QUIZ_REDIS_PREFIX}:occupied`,
    })
  ).rejects.toMatchObject({ code: 'EADDRINUSE' });
});

it('binds socket answers to the authenticated room and returns the receipt only to its sender', async () => {
  const guest = await createGuestSession();
  const room = await createRoom('回答ホスト', guest.userId);
  const peer = await createGuestSession();
  await joinRoom(room.room.code, '回答参加者', peer.userId);
  const game = await db.game.findUniqueOrThrow({
    where: { code: room.room.code },
  });
  const fields = {
    question: '問題',
    choices: { A: '一', B: '二', C: '三', D: '四' },
    answer: 'A' as const,
    type: 'final' as const,
    timeLimit: 10,
    choiceImages: {},
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
  await runHostCommand(guest.userId, {
    gameId: game.id,
    requestId: randomUUID(),
    expectedVersion: game.version,
    action: 'start',
  });
  const socket = await connect(a.port, await ticket(guest, game.code));
  const other = await connect(b.port, await ticket(peer, game.code));
  const observed: string[] = [];
  other.onAny((name) => observed.push(name));
  const payload = {
    questionId: question.id,
    requestId: randomUUID(),
    choice: 'A',
  };
  expect(
    await socket
      .timeout(2000)
      .emitWithAck('SUBMIT_ANSWER', { ...payload, gameId: randomUUID() })
  ).toEqual({ ok: false, code: 'BAD_REQUEST' });
  const response = await socket
    .timeout(2000)
    .emitWithAck('SUBMIT_ANSWER', payload);
  expect(response).toMatchObject({
    ok: true,
    receipt: { requestId: payload.requestId, choice: 'A' },
  });
  expect(response.receipt).not.toHaveProperty('isCorrect');
  expect(
    await socket.timeout(2000).emitWithAck('SUBMIT_ANSWER', payload)
  ).toEqual(response);
  expect(
    await socket
      .timeout(2000)
      .emitWithAck('SUBMIT_ANSWER', { ...payload, choice: 'B' })
  ).toEqual({ ok: false, code: 'REQUEST_CONFLICT' });
  expect(observed).toEqual([]);
});
