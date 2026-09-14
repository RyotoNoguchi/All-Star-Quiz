import type { FC } from 'react';
import type { PrivateGameSnapshot } from '@/types/game';
import { eliminationLabels } from '@/lib/game-labels';
type Props = { state: PrivateGameSnapshot };
export const PlayerResult: FC<Props> = ({ state }) => {
  const result = state.lastResult;
  if (!result) return null;
  const answer = result.answers.find(
    (item) => item.playerId === state.playerId
  );
  const player = state.players.find((item) => item.id === state.playerId);
  const question =
    state.question?.id === result.questionId ? state.question : undefined;
  const describe = (choice: 'A' | 'B' | 'C' | 'D') =>
    question ? `${choice}：${question.choices[choice]}` : choice;
  return (
    <section aria-label="自分の回答結果" className="space-y-4">
      <h2 className="text-2xl font-bold">
        {result.isFinal ? '最終問題の結果' : '問題の結果'}
      </h2>
      {question && (
        <p className="whitespace-pre-wrap break-words font-semibold">
          {question.question}
        </p>
      )}
      <p
        role="status"
        className={`rounded-lg p-4 font-bold ${answer?.isCorrect ? 'bg-green-900/60' : 'bg-white/10'}`}
      >
        {answer
          ? answer.isCorrect
            ? '正解です！'
            : '不正解です。'
          : 'この問題の回答はありません（未回答・観戦）。'}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 rounded-lg bg-white/10 p-4">
        <dt>あなたの回答</dt>
        <dd className="min-w-0 break-words">
          {answer ? describe(answer.choice) : '回答なし'}
        </dd>
        <dt>正解</dt>
        <dd className="min-w-0 break-words text-green-200 font-bold">
          {describe(result.correctAnswer)}
        </dd>
        {answer && (
          <>
            <dt>回答時間</dt>
            <dd>{(answer.responseTime / 1000).toFixed(3)} 秒</dd>
          </>
        )}
      </dl>
      {result.explanation && (
        <p className="rounded-lg bg-white/10 p-4 whitespace-pre-wrap break-words">
          {result.explanation}
        </p>
      )}
      <div className="rounded-lg border border-white/30 p-4 space-y-2">
        <h3 className="font-bold">
          参加状況：
          {player?.isEliminated
            ? '脱落・観戦中'
            : state.phase === 'finished'
              ? 'ゲーム終了'
              : '生存中'}
        </h3>
        {player?.isEliminated && player.eliminationReason && (
          <p>脱落理由：{eliminationLabels[player.eliminationReason]}</p>
        )}
        {state.phase !== 'finished' && (
          <p>
            {player?.isEliminated
              ? '回答はできませんが、このまま最後まで観戦できます。'
              : '次の問題が始まると自動で切り替わります。'}
          </p>
        )}
      </div>
    </section>
  );
};
