import type { Game, Prisma } from '@prisma/client';
import type { GameEvent } from '@/types/game';
import { snapshotForGame } from './game-state';
import { databaseTime } from './time';
export const appendGameEvent = async (
  tx: Prisma.TransactionClient,
  game: Game,
  type: GameEvent['type'],
  payload: Prisma.InputJsonValue
) =>
  tx.gameEventRecord.create({
    data: {
      gameId: game.id,
      version: game.version,
      type,
      payload,
      createdAt: await databaseTime(tx),
    },
  });
export const appendStateEvent = async (
  tx: Prisma.TransactionClient,
  game: Game
) => appendGameEvent(tx, game, 'STATE_SYNC', await snapshotForGame(tx, game));
