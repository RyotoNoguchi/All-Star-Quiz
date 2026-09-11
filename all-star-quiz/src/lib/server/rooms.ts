import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type Game, type Participant } from '@prisma/client';
import type { RoomView } from '@/types/room';
import { GAME_CONFIG } from '@/config/game';
import { db } from './db';

export class RoomError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}
export const participantTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const validateName = (name: unknown) => {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 20)
    throw new RoomError('名前を1〜20文字で入力してください。');
  return name.trim();
};
const validateCode = (code: string) => {
  if (!/^[A-F0-9]{6}$/.test(code))
    throw new RoomError('6文字のルームコードを入力してください。');
};
const view = (
  game: Game & { participants: Participant[] },
  playerId: string
): RoomView => ({
  room: {
    code: game.code,
    phase: 'waiting',
    createdAt: game.createdAt.getTime(),
    players: game.participants.map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.isHost,
    })),
  },
  playerId,
});
const includeParticipants = {
  participants: { orderBy: { joinedOrder: 'asc' as const } },
};
// PostgreSQL row locks serialize membership changes across processes, not just this runtime.
const withRoom = async <T>(
  code: string,
  action: (
    tx: Prisma.TransactionClient,
    game: Game & { participants: Participant[] }
  ) => Promise<T>
): Promise<T> => {
  validateCode(code);
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Game" WHERE code = ${code} FOR UPDATE`;
      const game = await tx.game.findUnique({
        where: { code },
        include: includeParticipants,
      });
      if (!game)
        return new RoomError(
          'ルームが見つかりません。コードを確認してください。',
          404
        );
      if (game.expiresAt.getTime() <= Date.now()) {
        if (game.phase !== 'finished')
          await tx.game.update({
            where: { id: game.id },
            data: {
              phase: 'finished',
              finishReason: 'expired',
              version: { increment: 1 },
            },
          });
        return new RoomError(
          'ルームの有効期限が切れました。新しいルームに参加してください。',
          404
        );
      }
      if (game.phase !== 'waiting')
        return new RoomError('このルームの参加受付は終了しています。', 409);
      return action(tx, game);
    },
    { maxWait: 10000, timeout: 15000 }
  );
  if (result instanceof RoomError) throw result;
  return result;
};
const member = async (
  tx: Prisma.TransactionClient,
  gameId: string,
  token: string
) => {
  const player = await tx.participant.findFirst({
    where: { gameId, user: { tokenHash: participantTokenHash(token) } },
  });
  if (!player) throw new RoomError('このルームに参加してください。', 403);
  return player;
};
export const createRoom = async (
  name: unknown,
  token: string
): Promise<RoomView> => {
  const playerName = validateName(name);
  // Retry the rare random code collision or concurrent creation of the same identity.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { tokenHash: participantTokenHash(token) },
          update: {},
          create: { tokenHash: participantTokenHash(token) },
        });
        const game = await tx.game.create({
          data: {
            code: randomBytes(3).toString('hex').toUpperCase(),
            expiresAt: new Date(Date.now() + 86400000),
            participants: {
              create: { userId: user.id, name: playerName, isHost: true },
            },
          },
          include: includeParticipants,
        });
        return view(game, game.participants[0]!.id);
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
    }
  }
  throw new RoomError(
    'ルームを作成できませんでした。もう一度お試しください。',
    503
  );
};
export const joinRoom = async (code: string, name: unknown, token: string) => {
  const playerName = validateName(name);
  return withRoom(code, async (tx, game) => {
    const existing = await tx.participant.findFirst({
      where: {
        gameId: game.id,
        user: { tokenHash: participantTokenHash(token) },
      },
    });
    if (existing) return view(game, existing.id);
    if (game.participants.length >= GAME_CONFIG.RULES.MAX_PLAYERS)
      throw new RoomError('ルームは満員です。', 409);
    if (game.participants.some((player) => player.name === playerName))
      throw new RoomError(
        'その名前は使用されています。別の名前を入力してください。',
        409
      );
    const user = await tx.user.upsert({
      where: { tokenHash: participantTokenHash(token) },
      update: {},
      create: { tokenHash: participantTokenHash(token) },
    });
    const player = await tx.participant.create({
      data: { gameId: game.id, userId: user.id, name: playerName },
    });
    await tx.game.update({
      where: { id: game.id },
      data: { version: { increment: 1 } },
    });
    return view(
      { ...game, participants: [...game.participants, player] },
      player.id
    );
  });
};
export const readRoom = (code: string, token: string) =>
  withRoom(code, async (tx, game) =>
    view(game, (await member(tx, game.id, token)).id)
  );
export const leaveRoom = (code: string, token: string) =>
  withRoom(code, async (tx, game) => {
    const player = await member(tx, game.id, token);
    await tx.participant.delete({ where: { id: player.id } });
    const remaining = game.participants.filter(
      (other) => other.id !== player.id
    );
    if (!remaining.length) await tx.game.delete({ where: { id: game.id } });
    else {
      if (player.isHost)
        await tx.participant.update({
          where: { id: remaining[0]!.id },
          data: { isHost: true },
        });
      await tx.game.update({
        where: { id: game.id },
        data: { version: { increment: 1 } },
      });
    }
    return { ok: true };
  });
