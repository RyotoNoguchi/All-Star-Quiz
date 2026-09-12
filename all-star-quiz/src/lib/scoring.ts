import type { EliminationReason } from '@/types/game';
export type ScoringPlayer = {
  id: string;
  isEliminated: boolean;
  hasLeft: boolean;
};
export type ScoringAnswer = {
  playerId: string;
  isCorrect: boolean;
  responseTime: number;
  acceptanceSequence: number;
};
export const normalEliminations = (
  players: ScoringPlayer[],
  answers: ScoringAnswer[]
) => {
  const living = players.filter(
    (player) => !player.isEliminated && !player.hasLeft
  );
  const byPlayer = new Map(answers.map((answer) => [answer.playerId, answer]));
  const eliminated: { playerId: string; reason: EliminationReason }[] = [];
  const correct: ScoringAnswer[] = [];
  for (const player of living) {
    const answer = byPlayer.get(player.id);
    if (!answer) eliminated.push({ playerId: player.id, reason: 'timeout' });
    else if (!answer.isCorrect)
      eliminated.push({ playerId: player.id, reason: 'wrong' });
    else correct.push(answer);
  }
  if (correct.length > 1) {
    const slowest = [...correct].sort(
      (a, b) =>
        b.responseTime - a.responseTime ||
        b.acceptanceSequence - a.acceptanceSequence
    )[0]!;
    eliminated.push({ playerId: slowest.playerId, reason: 'slowest' });
  }
  return eliminated;
};
