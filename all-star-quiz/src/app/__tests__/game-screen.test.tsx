import { render, screen } from '@testing-library/react';
import Home from '../page';
import type { PrivateGameSnapshot } from '@/types/game';
const connection = vi.hoisted(() => ({
  state: null as PrivateGameSnapshot | null,
}));
vi.mock('@/hooks/use-game-connection', () => ({
  useGameConnection: () => ({
    state: connection.state,
    status: 'connected',
    message: '',
    retry: vi.fn(),
    clock: { serverTime: 1000, measuredAt: performance.now() },
  }),
  announceRoomDeparture: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  api: {},
  apiErrorStatus: () => undefined,
}));
it('moves automatically through question, elimination, spectating and final results', () => {
  const player = { id: 'me', name: '私', isHost: true, isEliminated: false };
  const initial: PrivateGameSnapshot = {
    gameId: 'game',
    code: 'ABCDEF',
    playerId: 'me',
    phase: 'waiting',
    players: [player],
    hostId: 'me',
    version: 0,
    serverTime: 1000,
    answerCount: 0,
  };
  connection.state = initial;
  const page = render(<Home />);
  expect(screen.getByText('クイズの待合室')).toBeVisible();
  connection.state = {
    ...initial,
    phase: 'playing',
    deadlineAt: 11000,
    question: {
      id: 'q',
      question: '最初の問題',
      choices: { A: '一', B: '二', C: '三', D: '四' },
    },
  };
  page.rerender(<Home />);
  expect(screen.getByRole('button', { name: '選択肢A: 一' })).toBeEnabled();
  connection.state = {
    ...connection.state,
    phase: 'results',
    players: [{ ...player, isEliminated: true, eliminationReason: 'timeout' }],
    lastResult: {
      questionId: 'q',
      correctAnswer: 'A',
      isFinal: false,
      answers: [],
      players: [],
    },
  };
  page.rerender(<Home />);
  expect(screen.getByText('参加状況：脱落・観戦中')).toBeVisible();
  connection.state = {
    ...connection.state,
    phase: 'playing',
    question: {
      ...connection.state.question!,
      id: 'next',
      question: '次の問題',
    },
  };
  page.rerender(<Home />);
  expect(screen.getByRole('heading', { name: '次の問題' })).toBeVisible();
  expect(screen.getByRole('button', { name: '選択肢A: 一' })).toBeDisabled();
  connection.state = {
    ...connection.state,
    phase: 'finished',
    result: {
      gameId: 'game',
      reason: 'all_eliminated',
      totalQuestions: 2,
      completedAt: '2026-09-14T12:00:00Z',
      finalRanking: [{ playerId: 'me', rank: 1, survivedQuestions: 0 }],
      statistics: {
        totalPlayers: 1,
        totalAnswers: 0,
        averageResponseTime: 0,
        questionStats: [],
      },
    },
  };
  page.rerender(<Home />);
  expect(screen.getByRole('heading', { name: '最終結果' })).toBeVisible();
  expect(screen.getByRole('button', { name: '参加画面に戻る' })).toBeEnabled();
});
