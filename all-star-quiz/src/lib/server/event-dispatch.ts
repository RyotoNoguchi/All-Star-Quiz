import { db } from './db';
import { parseGameEvent } from '../realtime-schema';
import type { GameEvent } from '@/types/game';

// Publish before marking delivered. A crash can replay an event; versions deduplicate it.
export const dispatchGameEvents = async (
  publish: (event: GameEvent) => Promise<unknown>
) => {
  const games = await db.gameEventRecord.findMany({
    where: { publishedAt: null },
    distinct: ['gameId'],
    select: { gameId: true },
    take: 100,
  });
  for (const { gameId } of games) {
    await db.$transaction(
      async (tx) => {
        const [lease] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(150015, hashtext(${gameId})) AS locked
      `;
        if (!lease?.locked) return;
        const records = await tx.gameEventRecord.findMany({
          where: { gameId, publishedAt: null },
          orderBy: { version: 'asc' },
          take: 100,
        });
        for (const record of records) {
          const event = parseGameEvent({
            gameId,
            eventId: record.id,
            version: record.version,
            serverTime: record.createdAt.getTime(),
            type: record.type,
            payload: record.payload,
          });
          await publish(event);
          await tx.gameEventRecord.update({
            where: { id: record.id },
            data: { publishedAt: new Date() },
          });
        }
      },
      { timeout: 15000 }
    );
  }
};
