import Link from 'next/link';
import type { FC } from 'react';
import type { PrivateGameSnapshot } from '@/types/game';
import { finishLabels } from '@/lib/game-labels';
import { PlayerResult } from './PlayerResult';
type Props = { state: PrivateGameSnapshot };
export const PlayerFinalResult: FC<Props> = ({ state }) => {
  const result = state.result;
  if (!result) return <p role="status">ゲームが終了しました。</p>;
  const playerName = (id: string) =>
    state.players.find((player) => player.id === id)?.name || '参加者';
  const own = result.finalRanking.find(
    (entry) => entry.playerId === state.playerId
  );
  return (
    <div className="space-y-6">
      <section aria-label="ゲームの最終結果" className="space-y-4">
        <h2 className="text-3xl font-bold">最終結果</h2>
        <p
          role="status"
          className="rounded-lg bg-yellow-400/20 p-5 text-xl font-bold"
        >
          {result.winnerId
            ? result.winnerId === state.playerId
              ? 'あなたが優勝しました！'
              : `優勝：${playerName(result.winnerId)}`
            : '今回は優勝者なしです。'}
        </p>
        <p>{finishLabels[result.reason]}</p>
        <Link
          className="inline-block underline"
          href={`/history?game=${state.gameId}`}
        >
          このゲームの個人成績を見る
        </Link>
        {own && (
          <p className="text-lg">
            あなたの順位：<strong>{own.rank}位</strong> ／ 生存した問題：
            {own.survivedQuestions}問
          </p>
        )}
        <p className="text-sm text-white/80">
          参加者 {result.statistics.totalPlayers}人・出題{' '}
          {result.totalQuestions}問。同じ到達状況の参加者は同順位です。
        </p>
        <ol aria-label="最終順位" className="space-y-2">
          {result.finalRanking.map((entry) => (
            <li
              key={entry.playerId}
              className={`flex gap-3 rounded-lg p-3 ${entry.playerId === state.playerId ? 'bg-blue-500/30 border border-blue-200' : 'bg-white/10'}`}
            >
              <span className="shrink-0 font-bold">{entry.rank}位</span>
              <span className="min-w-0 break-words flex-1">
                {playerName(entry.playerId)}
                {entry.playerId === state.playerId ? '（あなた）' : ''}
              </span>
              <span className="shrink-0 text-sm">
                生存 {entry.survivedQuestions}問
              </span>
            </li>
          ))}
        </ol>
      </section>
      {state.lastResult && <PlayerResult state={state} />}
    </div>
  );
};
