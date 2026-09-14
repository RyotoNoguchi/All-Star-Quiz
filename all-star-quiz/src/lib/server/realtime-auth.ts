import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { hashToken, type GuestIdentity } from './session';

const payloadSchema = z
  .object({
    role: z.enum(['player', 'monitor']).default('player'),
    sessionHash: z.string().regex(/^[a-f0-9]{64}$/),
    gameId: z.string(),
    origin: z.string(),
    nonce: z.string().regex(/^[a-f0-9]{32}$/),
    expiresAt: z.number().int(),
  })
  .strict();
export type RealtimeIdentity = {
  role: 'player' | 'monitor';
  sessionHash: string;
  gameId: string;
  userId: string;
  playerId: string;
  code: string;
  expiresAt: number;
};
const secret = () => {
  const value = process.env.REALTIME_TICKET_SECRET;
  if (!value || value.length < 32 || value.startsWith('replace-with-'))
    throw new Error(
      'Configure REALTIME_TICKET_SECRET with at least 32 random characters'
    );
  return value;
};
const sign = (value: string) =>
  createHmac('sha256', secret()).update(value).digest('base64url');
export const currentRealtimeIdentity = async (
  sessionHash: string,
  gameId: string,
  role: 'player' | 'monitor' = 'player'
): Promise<RealtimeIdentity> => {
  const session = await db.guestSession.findUnique({
    where: { tokenHash: sessionHash },
  });
  const game = await db.game.findUnique({ where: { id: gameId } });
  if (
    !session ||
    !game ||
    Math.min(session.expiresAt.getTime(), game.expiresAt.getTime()) <=
      Date.now()
  )
    throw new Error('UNAUTHORIZED');
  const player = await db.participant.findUnique({
    where: { gameId_userId: { gameId, userId: session.userId } },
  });
  if (!player || player.leftAt || (role === 'monitor' && !player.isHost))
    throw new Error('UNAUTHORIZED');
  return {
    role,
    sessionHash,
    gameId,
    userId: session.userId,
    playerId: player.id,
    code: game.code,
    expiresAt: Math.min(session.expiresAt.getTime(), game.expiresAt.getTime()),
  };
};
export const issueRealtimeTicket = async (
  identity: GuestIdentity,
  code: string,
  origin: string,
  role: 'player' | 'monitor' = 'player'
) => {
  const game = await db.game.findUnique({ where: { code } });
  if (!game) throw new Error('UNAUTHORIZED');
  const current = await currentRealtimeIdentity(
    hashToken(identity.token),
    game.id,
    role
  );
  const expiresAt = Math.min(Date.now() + 60000, current.expiresAt);
  const payload = Buffer.from(
    JSON.stringify({
      role,
      sessionHash: current.sessionHash,
      gameId: game.id,
      origin,
      nonce: randomBytes(16).toString('hex'),
      expiresAt,
    })
  ).toString('base64url');
  return { ticket: `${payload}.${sign(payload)}`, expiresAt };
};
export const verifyRealtimeTicket = async (ticket: unknown, origin: string) => {
  if (typeof ticket !== 'string' || ticket.length > 2048)
    throw new Error('UNAUTHORIZED');
  const parts = ticket.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1])
    throw new Error('UNAUTHORIZED');
  const signature = Buffer.from(parts[1]);
  const expected = Buffer.from(sign(parts[0]));
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  )
    throw new Error('UNAUTHORIZED');
  const payload = payloadSchema.parse(
    JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  );
  if (
    payload.origin !== origin ||
    payload.expiresAt <= Date.now() ||
    payload.expiresAt > Date.now() + 60000
  )
    throw new Error('UNAUTHORIZED');
  return {
    identity: await currentRealtimeIdentity(
      payload.sessionHash,
      payload.gameId,
      payload.role
    ),
    nonce: payload.nonce,
    expiresAt: payload.expiresAt,
  };
};
export const validateRealtimeSecret = () => {
  secret();
};
