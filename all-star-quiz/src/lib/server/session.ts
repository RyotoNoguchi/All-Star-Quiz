import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { db } from './db';

export const SESSION_COOKIE = 'quiz-participant';
export const SESSION_TTL_MS = 30 * 86400000;
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export type GuestIdentity = { userId: string; token: string; expiresAt: Date };
export class SessionError extends Error {
  constructor() {
    super(
      '参加情報の有効期限が切れました。名前を入力して参加し直してください。'
    );
  }
}
export const readSession = async (
  token: string
): Promise<GuestIdentity | null> => {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = hashToken(token);
  const session = await db.guestSession.findUnique({ where: { tokenHash } });
  if (session)
    return session.expiresAt.getTime() > Date.now()
      ? { userId: session.userId, token, expiresAt: session.expiresAt }
      : null;
  // One-time upgrade for pre-session cookies. Preserve the original one-day expiry.
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
    const legacy = await tx.user.findUnique({ where: { tokenHash } });
    if (!legacy) {
      const concurrent = await tx.guestSession.findUnique({
        where: { tokenHash },
      });
      return concurrent && concurrent.expiresAt.getTime() > Date.now()
        ? { userId: concurrent.userId, token, expiresAt: concurrent.expiresAt }
        : null;
    }
    const expiresAt = new Date(legacy.createdAt.getTime() + 86400000);
    if (expiresAt.getTime() <= Date.now()) return null;
    await tx.guestSession.create({
      data: { tokenHash, userId: legacy.id, expiresAt },
    });
    await tx.user.update({
      where: { id: legacy.id },
      data: { tokenHash: null },
    });
    return { userId: legacy.id, token, expiresAt };
  });
};
export const createGuestSession = async (): Promise<GuestIdentity> => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const user = await db.user.create({
    data: { sessions: { create: { tokenHash: hashToken(token), expiresAt } } },
  });
  return { userId: user.id, token, expiresAt };
};
export const revokeSession = async (token: string) => {
  await db.guestSession.deleteMany({ where: { tokenHash: hashToken(token) } });
};
export const requestIdentity = async (request: NextRequest) =>
  readSession(request.cookies.get(SESSION_COOKIE)?.value || '');
export const requireIdentity = async (request: NextRequest) => {
  const identity = await requestIdentity(request);
  if (!identity) throw new SessionError();
  return identity;
};
export const setSessionCookie = (
  response: NextResponse,
  identity: GuestIdentity,
  secure: boolean
) => {
  response.cookies.set(SESSION_COOKIE, identity.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: identity.expiresAt,
  });
};
