import { render, screen } from '@testing-library/react';
import { MonitorView } from '../game/MonitorView';
import type { GameSnapshot } from '@/types/game';
const state: GameSnapshot = {
  gameId: 'g',
  code: 'ABCDEF',
  phase: 'waiting',
  version: 1,
  serverTime: 1000,
  hostId: 'host',
  answerCount: 0,
  players: [
    { id: 'host', name: 'ホスト', isHost: true, isEliminated: false },
    { id: 'other', name: '参加者', isHost: false, isEliminated: true },
    {
      id: 'left',
      name: '退出者',
      isHost: false,
      isEliminated: true,
      leftAt: 1,
    },
  ],
};
it('shows only present members and counts living players from the server', () => {
  render(<MonitorView state={state} clock={null} />);
  expect(screen.getByText('参加者 2人')).toBeVisible();
  expect(screen.getByText('生存者 1人')).toBeVisible();
  expect(screen.queryByText('退出者')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '参加者を募集中' })).toBeVisible();
});
it('shows questions, images and updated counts without any answer controls or early result', () => {
  const question = {
    id: 'q',
    question: '長い問題文'.repeat(50),
    choices: { A: '選択肢A'.repeat(30), B: '二', C: '三', D: '四' },
    choiceImages: {
      A: { url: 'https://example.com/image.png', alt: '画像の説明' },
    },
  };
  const view = render(
    <MonitorView
      state={{ ...state, phase: 'playing', question, deadlineAt: 11000 }}
      clock={{ serverTime: 1000, measuredAt: performance.now() }}
    />
  );
  expect(
    screen.getByRole('heading', { name: question.question })
  ).toBeVisible();
  expect(screen.getByRole('img', { name: '画像の説明' })).toBeVisible();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryByText('正解')).not.toBeInTheDocument();
  expect(screen.getByText('回答 0 / 1人')).toBeVisible();
  view.rerender(
    <MonitorView
      state={{
        ...state,
        phase: 'closing',
        question,
        answerCount: 1,
        deadlineAt: 11000,
      }}
      clock={{ serverTime: 1000, measuredAt: performance.now() }}
    />
  );
  expect(screen.getByText('回答 1 / 1人')).toBeVisible();
  expect(screen.getByText('回答締切')).toBeVisible();
});
