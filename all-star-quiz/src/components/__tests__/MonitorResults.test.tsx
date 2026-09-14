import { act, render, screen } from '@testing-library/react';
import { MonitorView } from '../game/MonitorView';
import type { GameSnapshot } from '@/types/game';
import type { ResultPresentation } from '@/lib/result-presentation';
const state: GameSnapshot = {
  gameId: 'g',
  code: 'ABCDEF',
  phase: 'results',
  version: 5,
  serverTime: 1,
  hostId: 'a',
  answerCount: 2,
  players: [
    { id: 'a', name: '生存さん', isHost: true, isEliminated: false },
    {
      id: 'b',
      name: '今回脱落',
      isHost: false,
      isEliminated: true,
      eliminationReason: 'wrong',
    },
    {
      id: 'c',
      name: '以前脱落',
      isHost: false,
      isEliminated: true,
      eliminationReason: 'timeout',
    },
  ],
  lastResult: {
    questionId: 'q',
    correctAnswer: 'A',
    explanation: '解説',
    isFinal: false,
    answers: [],
    players: [],
  },
};
const presentation: ResultPresentation = {
  gameId: 'g',
  questionId: 'q',
  eventId: 'e',
  startedAt: 0,
  isFinal: false,
  newlyEliminatedIds: ['b'],
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('reveals results in order and only animates newly eliminated players', () => {
  const view = render(
    <MonitorView state={state} clock={null} presentation={presentation} />
  );
  expect(screen.getByLabelText('正解発表')).toHaveClass('quiz-bounce');
  expect(screen.queryByLabelText('脱落者と理由')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(900));
  expect(screen.getByText('× 今回脱落').parentElement).toHaveClass(
    'quiz-shake'
  );
  expect(screen.getByText('× 以前脱落').parentElement).not.toHaveClass(
    'quiz-shake'
  );
  expect(screen.getByText('不正解のため脱落しました。')).toBeVisible();
  expect(screen.queryByLabelText('生存者一覧')).not.toBeInTheDocument();
  view.rerender(
    <MonitorView
      state={{ ...state }}
      clock={null}
      presentation={presentation}
    />
  );
  act(() => vi.advanceTimersByTime(900));
  expect(screen.getByLabelText('生存者一覧')).toBeVisible();
});
it.each([false, true])(
  'shows static results immediately for snapshot or reduced motion (%s)',
  (reducedMotion) => {
    render(
      <MonitorView
        state={state}
        clock={null}
        presentation={reducedMotion ? presentation : null}
        reducedMotion={reducedMotion}
      />
    );
    expect(screen.getByLabelText('生存者一覧')).toBeVisible();
    expect(screen.getByLabelText('正解発表')).not.toHaveClass('quiz-bounce');
  }
);
it('prioritizes the next question during a reveal', () => {
  const view = render(
    <MonitorView state={state} clock={null} presentation={presentation} />
  );
  view.rerender(
    <MonitorView
      state={{
        ...state,
        phase: 'playing',
        question: {
          id: 'next',
          question: '次の問題',
          choices: { A: '一', B: '二', C: '三', D: '四' },
        },
      }}
      clock={null}
      presentation={presentation}
    />
  );
  act(() => vi.advanceTimersByTime(4000));
  expect(screen.getByText('次の問題')).toBeVisible();
  expect(screen.queryByLabelText('結果発表')).not.toBeInTheDocument();
});
