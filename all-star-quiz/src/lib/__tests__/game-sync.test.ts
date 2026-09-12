import { applyGameEvent, applyGameSnapshot } from '../game-sync';
import { parseGameEvent, parsePrivateSnapshot } from '../realtime-schema';
import type { GameEvent, PrivateGameSnapshot } from '@/types/game';
const state: PrivateGameSnapshot = {
  gameId: 'game',
  code: 'ABCDEF',
  playerId: 'me',
  version: 3,
  serverTime: 1,
  phase: 'playing',
  players: [],
  hostId: 'me',
  answerCount: 0,
  question: {
    id: 'q',
    question: '問題',
    choices: { A: 'a', B: 'b', C: 'c', D: 'd' },
  },
  ownAnswer: {
    questionId: 'q',
    requestId: 'request',
    choice: 'A',
    answeredAt: 1,
    responseTime: 1,
  },
};
const event: GameEvent = {
  gameId: 'game',
  eventId: 'event',
  version: 4,
  serverTime: 2,
  type: 'ANSWER_COUNT_UPDATED',
  payload: { questionId: 'q', answerCount: 1 },
};
it('ignores duplicate, reversed and foreign events and requests a snapshot for a gap', () => {
  const updated = applyGameEvent(state, event);
  expect(updated.state?.answerCount).toBe(1);
  expect(updated.state?.ownAnswer).toEqual(state.ownAnswer);
  expect(applyGameEvent(updated.state, event).state).toBe(updated.state);
  expect(applyGameEvent(state, { ...event, version: 2 }).state).toBe(state);
  expect(applyGameEvent(state, { ...event, gameId: 'other' }).state).toBe(
    state
  );
  expect(applyGameEvent(state, { ...event, version: 5 }).needsSync).toBe(true);
  expect(applyGameEvent(null, event).needsSync).toBe(true);
  expect(
    applyGameEvent(state, {
      ...event,
      payload: { questionId: 'wrong', answerCount: 1 },
    }).needsSync
  ).toBe(true);
});
it('never rolls back to a delayed snapshot and clears old receipts on the next question', () => {
  const updated = applyGameEvent(state, event).state!;
  expect(applyGameSnapshot(updated, state)).toBe(updated);
  const next = applyGameEvent(state, {
    ...event,
    type: 'QUESTION_STARTED',
    payload: {
      question: { ...state.question!, id: 'next' },
      startedAt: 2,
      deadlineAt: 10002,
    },
  });
  expect(next.state).not.toHaveProperty('ownAnswer');
  expect(next.state?.answerCount).toBe(0);
});
it('signals the final bell once for a live result, never for duplicate or state synchronization', () => {
  const result: GameEvent = {
    ...event,
    type: 'QUESTION_ENDED',
    payload: {
      questionId: 'q',
      correctAnswer: 'A',
      isFinal: true,
      answers: [],
      players: [],
    },
  };
  const updated = applyGameEvent(state, result);
  expect(updated.finalBell).toBe(true);
  expect(applyGameEvent(updated.state, result).finalBell).toBe(false);
  expect(
    applyGameEvent(state, {
      ...event,
      type: 'STATE_SYNC',
      payload: updated.state!,
    }).finalBell
  ).toBe(false);
});
it('strips private and answer fields from public wire data while preserving the own receipt in a private snapshot', () => {
  const parsed = parseGameEvent({
    ...event,
    type: 'STATE_SYNC',
    payload: {
      ...state,
      version: 4,
      question: {
        ...state.question,
        answer: 'A',
        type: 'final',
        explanation: 'secret',
      },
    },
  });
  const raw = JSON.stringify(parsed);
  expect(raw).not.toContain('secret');
  expect(raw).not.toContain('ownAnswer');
  expect(raw).not.toContain('"type":"final"');
  expect(parsePrivateSnapshot(state).ownAnswer).toEqual(state.ownAnswer);
});
