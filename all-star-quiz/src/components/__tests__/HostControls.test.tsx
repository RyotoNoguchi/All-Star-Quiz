import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { HostControls } from '../game/HostControls';
import type { PrivateGameSnapshot } from '@/types/game';
const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  command: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  api: {
    host: { status: { query: mocks.status } },
    games: { command: { mutate: mocks.command } },
    questions: { prepareGame: { mutate: mocks.prepare } },
  },
  apiErrorStatus: (cause: { status?: number }) => cause.status,
}));
const state: PrivateGameSnapshot = {
  gameId: 'game',
  code: 'ABCDEF',
  playerId: 'me',
  hostId: 'me',
  version: 5,
  serverTime: 1,
  phase: 'waiting',
  answerCount: 0,
  players: [
    { id: 'me', name: 'ホスト', isHost: true, isEliminated: false },
    { id: 'peer', name: '参加者', isHost: false, isEliminated: false },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({
    version: 5,
    preparedCount: 2,
    players: [
      { id: 'me', connected: true },
      { id: 'peer', connected: false },
    ],
  });
});
it('requires preparation and two participants, and disables commands offline', async () => {
  const view = render(
    <HostControls state={state} connected onSync={vi.fn()} />
  );
  expect(screen.getByText('ゲームを開始')).toBeDisabled();
  await waitFor(() => expect(screen.getByText('ゲームを開始')).toBeEnabled());
  expect(screen.getByText('参加者：未接続・切断中')).toBeVisible();
  view.rerender(
    <HostControls state={state} connected={false} onSync={vi.fn()} />
  );
  expect(screen.getByText('ゲームを開始')).toBeDisabled();
});
it('prevents double clicks and retries uncertain commands with the same request', async () => {
  let reject!: (error: Error) => void;
  mocks.command.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  );
  render(
    <HostControls
      state={{ ...state, phase: 'results' }}
      connected
      onSync={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText('次の問題へ'));
  fireEvent.click(screen.getByText('次の問題へ'));
  expect(mocks.command).toHaveBeenCalledTimes(1);
  const input = mocks.command.mock.calls[0]![0];
  await act(async () => reject(new Error('network')));
  mocks.command.mockResolvedValue({ version: 6 });
  fireEvent.click(screen.getByText('同じ操作を再確認'));
  await waitFor(() => expect(mocks.command).toHaveBeenCalledTimes(2));
  expect(mocks.command.mock.calls[1]![0]).toEqual(input);
  expect(screen.getByText('次の問題へ')).toBeDisabled();
});
it('does not offer next during answering and removes controls on host transfer', async () => {
  const view = render(
    <HostControls
      state={{ ...state, phase: 'playing' }}
      connected
      onSync={vi.fn()}
    />
  );
  expect(screen.queryByText('次の問題へ')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('ゲームを終了・中止'));
  expect(mocks.command).not.toHaveBeenCalled();
  expect(screen.getByText('中止を確定')).toBeVisible();
  view.rerender(
    <HostControls
      state={{ ...state, hostId: 'peer' }}
      connected
      onSync={vi.fn()}
    />
  );
  expect(screen.queryByText('中止を確定')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'ホストが変更されました'
  );
});
it('keeps preparation inputs and success notice without reconnecting', async () => {
  mocks.prepare.mockResolvedValue({ count: 2, version: 6 });
  const sync = vi.fn();
  render(<HostControls state={state} connected onSync={sync} />);
  fireEvent.change(screen.getByLabelText('出題数（最終問題を含む）'), {
    target: { value: '2' },
  });
  fireEvent.change(screen.getByLabelText('出題カテゴリ（空欄はすべて）'), {
    target: { value: '練習' },
  });
  fireEvent.click(screen.getByText('問題セットを準備する'));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('2問を準備しました')
  );
  expect(screen.getByLabelText('出題数（最終問題を含む）')).toHaveValue(2);
  expect(screen.getByLabelText('出題カテゴリ（空欄はすべて）')).toHaveValue(
    '練習'
  );
  expect(sync).not.toHaveBeenCalled();
});
