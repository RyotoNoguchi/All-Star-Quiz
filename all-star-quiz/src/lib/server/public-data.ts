import type { Participant } from '@prisma/client';
import { z } from 'zod';
import type { PublicPlayer } from '@/types/game';
export const publicParticipant = (player: Participant): PublicPlayer => ({
  id: player.id,
  name: player.name,
  isHost: player.isHost,
  isEliminated: player.isEliminated,
  ...(player.eliminationReason
    ? {
        eliminationReason: z
          .enum(['wrong', 'timeout', 'slowest', 'left'])
          .parse(player.eliminationReason),
      }
    : {}),
  ...(player.leftAt ? { leftAt: player.leftAt.getTime() } : {}),
});
