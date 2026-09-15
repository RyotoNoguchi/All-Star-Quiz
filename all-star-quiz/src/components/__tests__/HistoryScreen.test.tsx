import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { HistoryScreen } from '../history/HistoryScreen';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  detail: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  api: {
    history: {
      list: { query: mocks.list },
      stats: { query: mocks.stats },
      detail: { query: mocks.detail },
    },
  },
  apiErrorStatus: (cause: { status?: number }) => cause.status,
}));
const gameId = '11111111-1111-4111-8111-111111111111';
const result = {
  gameId,
  code: 'ABCDEF',
  playerName: '履歴の本人',
  completedAt: '2026-09-15T12:00:00Z',
  reason: 'final_question',
  totalQuestions: 1,
  isWinner: true,
  rank: 1,
  survivedQuestions: 1,
  eliminatedAtQuestion: null,
  eliminationReason: null,
};
const list = {
  items: [result],
  total: 1,
  sessionExpiresAt: '2099-01-01T00:00:00Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/history');
  mocks.list.mockResolvedValue(list);
  mocks.stats.mockResolvedValue({
    games: 1,
    wins: 1,
    averageSurvived: 1,
    bestSurvived: 1,
  });
  mocks.detail.mockResolvedValue({
    result,
    questions: [
      {
        number: 1,
        question: '問題文',
        choices: { A: '青', B: '赤', C: '黄', D: '緑' },
        correctAnswer: 'A',
        explanation: '解説です',
        ownAnswer: { choice: 'A', isCorrect: true, responseTime: 1234 },
      },
    ],
  });
});
afterEach(() => cleanup());
it('opens personal detail, restores list and remembers only the selected game ID', async () => {
  render(<HistoryScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /履歴の本人/ }));
  expect(await screen.findByText('履歴の本人 の成績')).toBeVisible();
  expect(screen.getByText('あなたの回答：A（正解）・1.234秒')).toBeVisible();
  expect(localStorage.getItem('quiz-last-history-game')).toBe(gameId);
  fireEvent.click(screen.getByRole('button', { name: '履歴一覧へ戻る' }));
  expect(
    await screen.findByRole('button', { name: '前回見た履歴' })
  ).toBeVisible();
  expect(screen.getByRole('button', { name: '次のページ' })).toBeDisabled();
});
it('shows empty history and allows retry after a failed request', async () => {
  mocks.list.mockRejectedValueOnce(new Error('offline'));
  render(<HistoryScreen />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '履歴を読み込めません'
  );
  mocks.list.mockResolvedValue({ ...list, items: [], total: 0 });
  mocks.stats.mockResolvedValue({
    games: 0,
    wins: 0,
    averageSurvived: 0,
    bestSurvived: 0,
  });
  fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
  expect(
    await screen.findByText(/まだ終了したゲームの履歴がありません/)
  ).toBeVisible();
  expect(screen.getByText('0.0問')).toBeVisible();
});
it('removes displayed results and navigation preference when the session expires', async () => {
  localStorage.setItem('quiz-last-history-game', gameId);
  render(<HistoryScreen />);
  await screen.findByText('これまでの成績');
  mocks.list.mockRejectedValue({ status: 401 });
  fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
  expect(
    await screen.findByText('このブラウザーでは履歴を確認できません')
  ).toBeVisible();
  expect(screen.queryByText('これまでの成績')).toBeNull();
  expect(localStorage.getItem('quiz-last-history-game')).toBeNull();
});
it('does not show foreign details and ignores an obsolete late response after returning to the list', async () => {
  window.history.replaceState(null, '', `/history?game=${gameId}`);
  let resolve!: (value: unknown) => void;
  mocks.detail.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  render(<HistoryScreen />);
  await waitFor(() => expect(mocks.detail).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: '履歴一覧へ戻る' }));
  await screen.findByText('これまでの成績');
  await act(async () =>
    resolve({ result: { ...result, playerName: '古い詳細' }, questions: [] })
  );
  expect(screen.queryByText(/古い詳細/)).toBeNull();
  mocks.detail.mockRejectedValue({ status: 404 });
  fireEvent.click(screen.getByRole('button', { name: /履歴の本人/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'この履歴は見つかりません'
  );
});
