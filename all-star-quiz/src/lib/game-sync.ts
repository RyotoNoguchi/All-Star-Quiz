import type {
  GameEvent,
  GameSnapshot,
  PrivateGameSnapshot,
} from '@/types/game';

type SyncedSnapshot = GameSnapshot &
  Partial<Pick<PrivateGameSnapshot, 'playerId' | 'ownAnswer'>>;
export type SyncUpdate<T extends SyncedSnapshot = PrivateGameSnapshot> = {
  state: T | null;
  needsSync: boolean;
  finalBell: boolean;
};

export const applyGameEvent = <T extends SyncedSnapshot>(
  state: T | null,
  event: GameEvent
): SyncUpdate<T> => {
  const unchanged = { state, needsSync: false, finalBell: false };
  if (!state) return { ...unchanged, needsSync: true };
  if (event.gameId !== state.gameId || event.version <= state.version)
    return unchanged;
  if (event.version !== state.version + 1)
    return { ...unchanged, needsSync: true };
  let next: SyncedSnapshot = {
    ...state,
    version: event.version,
    serverTime: event.serverTime,
  };
  switch (event.type) {
    case 'STATE_SYNC':
      if (
        event.payload.gameId !== state.gameId ||
        event.payload.version !== event.version
      )
        return { ...unchanged, needsSync: true };
      next = { ...event.payload };
      if (state.playerId !== undefined) next.playerId = state.playerId;
      if (state.ownAnswer?.questionId === next.question?.id && state.ownAnswer)
        next.ownAnswer = state.ownAnswer;
      break;
    case 'QUESTION_STARTED':
      next = { ...next, ...event.payload, phase: 'playing', answerCount: 0 };
      delete next.ownAnswer;
      break;
    case 'ANSWER_COUNT_UPDATED':
    case 'QUESTION_CLOSED':
    case 'QUESTION_ENDED':
      if (event.payload.questionId !== state.question?.id)
        return { ...unchanged, needsSync: true };
      if (event.type === 'ANSWER_COUNT_UPDATED')
        next.answerCount = event.payload.answerCount;
      else if (event.type === 'QUESTION_CLOSED') next.phase = 'closing';
      else {
        next.phase = 'results';
        next.lastResult = event.payload;
        next.players = event.payload.players;
        next.hostId =
          event.payload.players.find((player) => player.isHost)?.id || '';
      }
      break;
    case 'GAME_ENDED':
      next.phase = 'finished';
      next.result = event.payload.result;
      if (event.payload.lastResult) next.lastResult = event.payload.lastResult;
      delete next.question;
      delete next.ownAnswer;
      break;
  }
  return {
    state: next as T,
    needsSync: false,
    finalBell: event.type === 'QUESTION_ENDED' && event.payload.isFinal,
  };
};

// A delayed snapshot must never roll back newer events. Synchronization is silent.
export const applyGameSnapshot = <T extends SyncedSnapshot>(
  state: T | null,
  snapshot: T
): T =>
  state && state.gameId === snapshot.gameId && state.version > snapshot.version
    ? state
    : snapshot;
