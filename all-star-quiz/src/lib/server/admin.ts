import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from './db';
import { hashToken } from './session';
export const ADMIN_COOKIE = 'quiz-admin';
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });
export const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
};
export const verifyPassword = async (password: string, stored: string) => {
  const [algorithm, salt, digest] = stored.split('$');
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !digest ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(digest)
  )
    return false;
  return timingSafeEqual(
    await derive(password, salt),
    Buffer.from(digest, 'hex')
  );
};
const dummyHash = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export const createAdminAccount = async (email: string, password: string) => {
  const input = z
    .object({
      email: z.email().transform((value) => value.toLowerCase()),
      password: z.string().min(12).max(128),
    })
    .parse({ email: email.trim(), password });
  return db.admin.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
    },
    select: { id: true, email: true },
  });
};
export const loginAdmin = async (email: string, password: string) => {
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Admin" WHERE email = ${email} FOR UPDATE`;
      const admin = await tx.admin.findUnique({ where: { email } });
      if (admin?.lockedUntil && admin.lockedUntil.getTime() > Date.now())
        return null;
      const valid = await verifyPassword(
        password,
        admin?.passwordHash || dummyHash
      );
      if (!admin || !admin.enabled || !valid) {
        if (admin) {
          const failures = admin.lockedUntil ? 1 : admin.failedAttempts + 1;
          await tx.admin.update({
            where: { id: admin.id },
            data: {
              failedAttempts: failures,
              lockedUntil:
                failures >= 5 ? new Date(Date.now() + 15 * 60000) : null,
            },
          });
        }
        return null;
      }
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 8 * 3600000);
      await tx.admin.update({
        where: { id: admin.id },
        data: { failedAttempts: 0, lockedUntil: null },
      });
      await tx.adminSession.create({
        data: { adminId: admin.id, tokenHash: hashToken(token), expiresAt },
      });
      return { token, expiresAt, admin: { id: admin.id, email: admin.email } };
    },
    { timeout: 15000 }
  );
  if (!result)
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message:
        'ログインできません。入力内容を確認するか、しばらく待ってお試しください。',
    });
  return result;
};
export const readAdminSession = async (token: string) => {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: true },
  });
  return session &&
    session.expiresAt.getTime() > Date.now() &&
    session.admin.enabled
    ? { id: session.admin.id, email: session.admin.email }
    : null;
};
export const logoutAdmin = (token: string) =>
  db.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
export const requireHost = async (code: string, userId: string) => {
  const game = await db.game.findUnique({
    where: { code },
    include: {
      participants: { where: { userId, isHost: true, leftAt: null } },
    },
  });
  if (
    !game ||
    game.expiresAt.getTime() <= Date.now() ||
    !game.participants.length
  )
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'このルームのホストだけが操作できます。',
    });
  return {
    id: game.id,
    code: game.code,
    version: game.version,
    phase: game.phase,
  };
};
