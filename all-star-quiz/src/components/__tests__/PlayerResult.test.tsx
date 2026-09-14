import { render, screen } from '@testing-library/react';
import { PlayerResult } from '../game/PlayerResult';
import { PlayerFinalResult } from '../game/PlayerFinalResult';
import type { PrivateGameSnapshot } from '@/types/game';
const state: PrivateGameSnapshot = {
  gameId: 'game',
  code: 'ABCDEF',
  playerId: 'me',
  version: 5,
  serverTime: 1000,
  phase: 'results',
  hostId: 'me',
  answerCount: 1,
  players: [
    { id: 'me', name: '私', isHost: true, isEliminated: false },
    { id: 'peer', name: '友達', isHost: false, isEliminated: false },
  ],
  question: {
    id: 'q',
    question: '問題本文',
    choices: { A: '正しい選択肢', B: '別の選択肢', C: '三', D: '四' },
  },
  lastResult: {
    questionId: 'q',
    correctAnswer: 'A',
    explanation: '正解の解説',
    isFinal: false,
    players: [],
    answers: [
      {
        playerId: 'me',
        questionId: 'q',
        choice: 'A',
        isCorrect: true,
        requestId: 'receipt',
        answeredAt: 1500,
        responseTime: 500,
        acceptanceSequence: 1,
      },
    ],
  },
};
it('shows the published answer, correctness, timing and survival', () => {
  render(<PlayerResult state={state} />);
  expect(screen.getByText('正解です！')).toBeVisible();
  expect(screen.getByText('0.500 秒')).toBeVisible();
  expect(screen.getByText('正解の解説')).toBeVisible();
  expect(screen.getByText('参加状況：生存中')).toBeVisible();
  expect(screen.getByText(/次の問題が始まると自動/)).toBeVisible();
});
it.each([
  ['wrong', '不正解のため脱落しました。'],
  ['timeout', '時間内に回答が届かなかったため脱落しました。'],
  ['slowest', '正解者の中で回答が最も遅かったため脱落しました。'],
] as const)(
  'explains %s elimination and keeps spectating available',
  (reason, message) => {
    render(
      <PlayerResult
        state={{
          ...state,
          players: [
            {
              ...state.players[0]!,
              isEliminated: true,
              eliminationReason: reason,
            },
          ],
          lastResult: {
            ...state.lastResult!,
            answers:
              reason === 'timeout'
                ? []
                : [
                    {
                      ...state.lastResult!.answers[0]!,
                      choice: reason === 'wrong' ? 'B' : 'A',
                      isCorrect: reason !== 'wrong',
                    },
                  ],
          },
        }}
      />
    );
    expect(screen.getByText(`脱落理由：${message}`)).toBeVisible();
    expect(screen.getByText('参加状況：脱落・観戦中')).toBeVisible();
    expect(screen.getByText(/このまま最後まで観戦/)).toBeVisible();
    if (reason === 'slowest')
      expect(screen.getByText('正解です！')).toBeVisible();
    if (reason === 'wrong')
      expect(screen.getByText('不正解です。')).toBeVisible();
    if (reason === 'timeout')
      expect(screen.getByText('回答なし')).toBeVisible();
  }
);
it('does not invent a new timeout for a spectator who was previously eliminated', () => {
  render(
    <PlayerResult
      state={{
        ...state,
        players: [
          {
            ...state.players[0]!,
            isEliminated: true,
            eliminationReason: 'wrong',
          },
        ],
        lastResult: { ...state.lastResult!, answers: [] },
      }}
    />
  );
  expect(
    screen.getByText('この問題の回答はありません（未回答・観戦）。')
  ).toBeVisible();
  expect(
    screen.queryByText(/時間内に回答が届かなかった/)
  ).not.toBeInTheDocument();
});
const finalState: PrivateGameSnapshot = {
  ...state,
  phase: 'finished',
  result: {
    gameId: 'game',
    winnerId: 'peer',
    reason: 'final_question',
    completedAt: '2026-09-14T12:00:00Z',
    totalQuestions: 2,
    finalRanking: [
      { playerId: 'peer', rank: 1, survivedQuestions: 2 },
      { playerId: 'me', rank: 2, survivedQuestions: 1 },
    ],
    statistics: {
      totalPlayers: 2,
      totalAnswers: 3,
      averageResponseTime: 500,
      questionStats: [],
    },
  },
};
it('shows persisted ranking and winner identically after snapshot restoration', () => {
  const first = render(<PlayerFinalResult state={finalState} />);
  const contents = first.container.textContent;
  expect(screen.getByText('優勝：友達')).toBeVisible();
  expect(screen.getByRole('list', { name: '最終順位' }).children).toHaveLength(
    2
  );
  first.unmount();
  const restored = render(
    <PlayerFinalResult
      state={JSON.parse(JSON.stringify(finalState)) as PrivateGameSnapshot}
    />
  );
  expect(restored.container.textContent).toBe(contents);
});
it('shows no winner for a cancelled game and does not reveal an unpublished result', () => {
  const cancelled = {
    ...finalState,
    result: { ...finalState.result!, reason: 'cancelled' as const },
  };
  delete cancelled.result.winnerId;
  delete cancelled.lastResult;
  render(<PlayerFinalResult state={cancelled} />);
  expect(screen.getByText('今回は優勝者なしです。')).toBeVisible();
  expect(screen.getByText('ホストがゲームを終了しました。')).toBeVisible();
  expect(screen.queryByText('正解')).not.toBeInTheDocument();
});
