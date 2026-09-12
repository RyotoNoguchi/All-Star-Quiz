import { db } from './db';
import { withGame, closeQuestionIfReady } from './game-flow';
import { GameFlowError } from './game-error';
export const heartbeatConnection = async (
  connectionId: string,
  gameId: string,
  playerId: string
) =>
  withGame(gameId, async (tx) => {
    const player = await tx.participant.findFirst({
      where: { id: playerId, gameId, leftAt: null },
    });
    if (!player) throw new GameFlowError('FORBIDDEN', '参加状態が無効です。');
    await tx.realtimeConnection.upsert({
      where: { id: connectionId },
      create: {
        id: connectionId,
        participantId: playerId,
        expiresAt: new Date(Date.now() + 15000),
      },
      update: { expiresAt: new Date(Date.now() + 15000) },
    });
    if (player.disconnectedAt)
      await tx.participant.update({
        where: { id: playerId },
        data: { disconnectedAt: null },
      });
  });
export const disconnectConnection = async (
  connectionId: string,
  gameId: string,
  playerId: string
) =>
  withGame(gameId, async (tx) => {
    await tx.realtimeConnection.deleteMany({
      where: { id: connectionId, participantId: playerId },
    });
    const count = await tx.realtimeConnection.count({
      where: { participantId: playerId, expiresAt: { gt: new Date() } },
    });
    if (!count)
      await tx.participant.updateMany({
        where: { id: playerId, disconnectedAt: null },
        data: { disconnectedAt: new Date() },
      });
  });
export const maintainGame = (gameId: string) =>
  withGame(gameId, async (tx, game) => {
    if (game.phase === 'finished') return game;
    const now = new Date();
    const players = await tx.participant.findMany({
      where: { gameId, leftAt: null },
      orderBy: { joinedOrder: 'asc' },
      include: { connections: { where: { expiresAt: { gt: now } } } },
    });
    const host = players.find((p) => p.isHost);
    let updated = game;
    if (host && !host.connections.length) {
      if (!host.disconnectedAt)
        await tx.participant.update({
          where: { id: host.id },
          data: { disconnectedAt: now },
        });
      else if (now.getTime() - host.disconnectedAt.getTime() >= 30000) {
        const next = players.find(
          (p) => p.id !== host.id && p.connections.length
        );
        if (next) {
          await tx.participant.update({
            where: { id: host.id },
            data: { isHost: false },
          });
          await tx.participant.update({
            where: { id: next.id },
            data: { isHost: true },
          });
          updated = await tx.game.update({
            where: { id: gameId },
            data: { version: { increment: 1 } },
          });
        }
      }
    }
    return closeQuestionIfReady(tx, updated);
  });
export const sweepGames = async () => {
  const games = await db.game.findMany({
    where: { phase: { not: 'finished' } },
    select: { id: true },
  });
  for (const game of games) {
    try {
      await maintainGame(game.id);
    } catch (error) {
      if (!(error instanceof GameFlowError)) throw error;
    }
  }
  await db.realtimeConnection.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
};
