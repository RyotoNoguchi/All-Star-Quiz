import { toPublicPlayer, toPublicQuestion } from '../game-contract';
import { isValidGamePhase } from '@/types/game';
import type {
  AnswerReceipt,
  GameEvent,
  SubmitAnswerRequest,
} from '@/types/game';

it('does not serialize the answer, final flag or explanation before results', () => {
  const publicQuestion = toPublicQuestion({
    id: 'q1',
    question: '問題',
    choices: { A: '1', B: '2', C: '3', D: '4' },
    answer: 'B',
    type: 'final',
    timeLimit: 10,
    explanation: '秘密の解説',
    category: '一般',
    choiceImages: { A: { url: 'https://example.test/a.png', alt: '画像' } },
  });
  expect(JSON.parse(JSON.stringify(publicQuestion))).toEqual({
    id: 'q1',
    question: '問題',
    choices: { A: '1', B: '2', C: '3', D: '4' },
    category: '一般',
    choiceImages: { A: { url: 'https://example.test/a.png', alt: '画像' } },
  });
});

it('keeps another player’s answer and timing out of the public player list', () => {
  expect(
    toPublicPlayer({
      id: 'p1',
      name: '参加者',
      isHost: false,
      isEliminated: false,
      score: 0,
      currentAnswer: 'A',
      answeredAt: 1234,
    })
  ).toEqual({ id: 'p1', name: '参加者', isHost: false, isEliminated: false });
});

it('recognizes the closing phase and rejects unknown phases', () => {
  expect(isValidGamePhase('closing')).toBe(true);
  expect(isValidGamePhase('closed')).toBe(false);
});

it('keeps client identity/time and private receipts outside public commands/events', () => {
  expectTypeOf<
    Extract<keyof SubmitAnswerRequest, 'playerId' | 'answeredAt'>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<GameEvent['type'], 'ANSWER_ACCEPTED'>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<keyof AnswerReceipt, 'isCorrect'>
  >().toEqualTypeOf<never>();
});
