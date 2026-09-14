import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerQuestion } from '../game/PlayerQuestion';
import { remainingSeconds } from '@/lib/server-clock';
import type { AnswerReceipt, PrivateGameSnapshot } from '@/types/game';
const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  api: { answers: { submit: { mutate: mocks.submit } } },
  apiErrorStatus: (cause: { status?: number }) => cause.status,
}));
const state: PrivateGameSnapshot = {
  code: 'ABCDEF',
  gameId: 'game',
  playerId: 'me',
  version: 3,
  serverTime: 1000,
  phase: 'playing',
  hostId: 'me',
  players: [{ id: 'me', name: '私', isHost: true, isEliminated: false }],
  answerCount: 0,
  startedAt: 1000,
  deadlineAt: 11000,
  question: {
    id: 'q',
    question: '長い問題文でも読めますか？'.repeat(20),
    choices: {
      A: '長い選択肢'.repeat(25),
      B: 'はい',
      C: 'いいえ',
      D: '分かりません',
    },
    choiceImages: {
      A: { url: 'https://example.com/choice.png', alt: '風景の写真' },
    },
  },
};
const receipt: AnswerReceipt = {
  requestId: '09ed0000-0000-4000-8000-000000000001',
  questionId: 'q',
  choice: 'B',
  answeredAt: 1100,
  responseTime: 100,
};
const show = (value = state, connected = true) =>
  render(
    <PlayerQuestion
      state={value}
      connected={connected}
      clock={{ serverTime: 1000, measuredAt: performance.now() }}
    />
  );
beforeEach(() => {
  sessionStorage.clear();
  mocks.submit.mockReset().mockResolvedValue(receipt);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('sends a keyboard-selected answer once and announces its receipt without revealing correctness', async () => {
  let resolve!: (value: AnswerReceipt) => void;
  mocks.submit.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  show();
  const button = screen.getByRole('button', { name: '選択肢B: はい' });
  button.focus();
  await userEvent.keyboard('{Enter}');
  fireEvent.click(button);
  expect(mocks.submit).toHaveBeenCalledTimes(1);
  expect(screen.getByText('回答を送信しています…')).toBeVisible();
  expect(
    screen.getByRole('button', { name: '選択肢C: いいえ' })
  ).toBeDisabled();
  await act(async () => resolve(receipt));
  expect(
    screen.getByText('回答 B を受け付けました。結果発表をお待ちください。')
  ).toBeVisible();
  expect(screen.queryByText('正解')).not.toBeInTheDocument();
});
it('reuses the same request and choice after a failed response, including after reload and deadline', async () => {
  mocks.submit.mockRejectedValueOnce(new Error('connection lost'));
  const view = show();
  fireEvent.click(screen.getByRole('button', { name: '選択肢B: はい' }));
  await screen.findByRole('button', { name: '同じ回答を再送する' });
  const first = mocks.submit.mock.calls[0]![0];
  view.unmount();
  show({ ...state, deadlineAt: 0 });
  fireEvent.click(
    await screen.findByRole('button', { name: '同じ回答を再送する' })
  );
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
  expect(mocks.submit.mock.calls[1]![0]).toEqual(first);
  expect(first.choice).toBe('B');
});
it('restores only the server-confirmed own answer and prevents another submission', () => {
  show({ ...state, ownAnswer: receipt });
  expect(screen.getByText(/回答 B を受け付けました/)).toBeVisible();
  expect(screen.getByRole('button', { name: '選択肢B: はい' })).toBeDisabled();
  expect(mocks.submit).not.toHaveBeenCalled();
});
it.each(['closing', 'results', 'finished'] as const)(
  'disables new answers in phase %s',
  (phase) => {
    show({ ...state, phase });
    for (const button of screen.getAllByRole('button'))
      expect(button).toBeDisabled();
  }
);
it('disables eliminated, disconnected and expired answering', () => {
  const view = show(state, false);
  expect(screen.getByRole('button', { name: '選択肢B: はい' })).toBeDisabled();
  view.rerender(
    <PlayerQuestion
      state={{
        ...state,
        players: [{ ...state.players[0]!, isEliminated: true }],
      }}
      connected
      clock={{ serverTime: 1000, measuredAt: performance.now() }}
    />
  );
  expect(screen.getByText(/観戦中です/)).toBeVisible();
  view.rerender(
    <PlayerQuestion
      state={{ ...state, deadlineAt: 0 }}
      connected
      clock={{ serverTime: 1000, measuredAt: performance.now() }}
    />
  );
  expect(screen.getByRole('button', { name: '選択肢B: はい' })).toBeDisabled();
});
it('uses monotonic server-relative time even when the wall clock changes', () => {
  const monotonic = vi.spyOn(performance, 'now').mockReturnValue(500);
  const clock = { serverTime: 1000, measuredAt: 500 };
  expect(remainingSeconds(11000, clock)).toBe(10);
  vi.spyOn(Date, 'now').mockReturnValue(9999999999999);
  monotonic.mockReturnValue(3500);
  expect(remainingSeconds(11000, clock)).toBe(7);
  monotonic.mockReturnValue(11000);
  expect(remainingSeconds(11000, clock)).toBe(0);
});
it('provides descriptive labels for image choices and preserves long question text', () => {
  show();
  expect(screen.getByRole('img', { name: '風景の写真' })).toBeVisible();
  expect(
    screen.getByRole('heading', { name: state.question!.question })
  ).toBeVisible();
  expect(
    screen.getByRole('button', {
      name: `選択肢A: ${state.question!.choices.A}`,
    })
  ).toBeVisible();
});
it('keeps the text choice usable when an image cannot be loaded', () => {
  show();
  fireEvent.error(screen.getByRole('img', { name: '風景の写真' }));
  expect(
    screen.getByText('風景の写真（画像を読み込めませんでした）')
  ).toBeVisible();
  expect(
    screen.getByRole('button', {
      name: `選択肢A: ${state.question!.choices.A}`,
    })
  ).toBeEnabled();
});
it('offers a safe retry when a request never returns', async () => {
  vi.useFakeTimers();
  mocks.submit.mockImplementation(
    (_input: unknown, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () =>
          reject(new Error('timeout'))
        );
      })
  );
  show();
  fireEvent.click(screen.getByRole('button', { name: '選択肢B: はい' }));
  await act(async () => vi.advanceTimersByTimeAsync(8000));
  expect(
    screen.getByRole('button', { name: '同じ回答を再送する' })
  ).toBeEnabled();
});
