'use client';
import { useEffect, useState, type FC } from 'react';
import type { GameSnapshot } from '@/types/game';
import { eliminationLabels, finishLabels } from '@/lib/game-labels';
import {
  resultStage,
  type ResultPresentation,
} from '@/lib/result-presentation';
type Props = {
  state: GameSnapshot;
  presentation: ResultPresentation | null;
  reducedMotion: boolean;
};
export const MonitorResults: FC<Props> = ({
  state,
  presentation,
  reducedMotion,
}) => {
  const live =
    presentation?.gameId === state.gameId &&
    presentation.questionId === state.lastResult?.questionId
      ? presentation
      : null;
  const [stage, setStage] = useState(() =>
    resultStage(live, reducedMotion, performance.now())
  );
  useEffect(() => {
    const update = () =>
      setStage(resultStage(live, reducedMotion, performance.now()));
    update();
    if (!live || reducedMotion) return;
    const timer = setInterval(() => {
      update();
      if (resultStage(live, false, performance.now()) === 3)
        clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, [live, reducedMotion]);
  const revealed = !live || reducedMotion ? 3 : stage;
  const animate = !!live && !reducedMotion;
  const result = state.lastResult;
  const players = state.players.filter((player) => !player.leftAt);
  const eliminated = players.filter((player) => player.isEliminated);
  const survivors = players.filter((player) => !player.isEliminated);
  const name = (id: string) =>
    state.players.find((player) => player.id === id)?.name || '参加者';
  return (
    <div className="space-y-8" aria-label="結果発表">
      {result && (
        <section
          className={`rounded-xl bg-green-900/50 border-2 border-green-300 p-6 ${animate ? 'quiz-bounce' : ''}`}
          aria-label="正解発表"
        >
          <h2 className="text-3xl lg:text-5xl font-bold">
            ✓ 正解：{result.correctAnswer}
            {result.isFinal ? '（最終問題）' : ''}
          </h2>
          {state.question?.id === result.questionId && (
            <p className="text-2xl lg:text-3xl mt-4 break-words">
              {state.question.choices[result.correctAnswer]}
            </p>
          )}
          {result.explanation && (
            <p className="text-xl lg:text-2xl mt-4 whitespace-pre-wrap break-words">
              {result.explanation}
            </p>
          )}
        </section>
      )}
      {result && revealed >= 1 && (
        <section aria-label="脱落者と理由" className="space-y-4">
          <h2 className="text-3xl lg:text-4xl font-bold">
            脱落・観戦中 {eliminated.length}人
          </h2>
          {eliminated.length ? (
            <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {eliminated.map((player) => (
                <li
                  key={player.id}
                  className={`rounded-xl bg-red-950/50 border border-red-300 p-5 ${animate && live?.newlyEliminatedIds.includes(player.id) ? 'quiz-shake' : ''}`}
                >
                  <p className="text-2xl font-bold break-words">
                    × {player.name}
                  </p>
                  <p className="text-lg mt-2">
                    {player.eliminationReason
                      ? eliminationLabels[player.eliminationReason]
                      : '脱落しています。'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-2xl">脱落者はいません。</p>
          )}
        </section>
      )}
      {result && revealed >= 2 && (
        <section aria-label="生存者一覧" className="space-y-4">
          <h2 className="text-3xl lg:text-4xl font-bold">
            生存者 {survivors.length}人
          </h2>
          {survivors.length ? (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {survivors.map((player) => (
                <li
                  key={player.id}
                  className="rounded-xl bg-blue-500/20 border border-blue-200 p-5 text-2xl font-bold break-words"
                >
                  ✓ {player.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-2xl">生存者はいません。</p>
          )}
        </section>
      )}
      {state.phase === 'finished' && state.result && revealed >= 3 && (
        <section
          aria-label="優勝と最終順位"
          className="space-y-5 rounded-xl border-2 border-yellow-200 bg-yellow-400/10 p-6"
        >
          <h2
            className={`text-4xl lg:text-6xl font-black break-words ${animate ? 'quiz-bounce' : ''}`}
          >
            {state.result.winnerId
              ? `🏆 優勝：${name(state.result.winnerId)}`
              : '優勝者なし'}
          </h2>
          <p className="text-2xl">{finishLabels[state.result.reason]}</p>
          <ol
            aria-label="最終順位"
            className="grid md:grid-cols-2 xl:grid-cols-3 gap-3"
          >
            {state.result.finalRanking.map((entry) => (
              <li
                key={entry.playerId}
                className="rounded-lg bg-white/10 p-4 text-xl break-words"
              >
                <strong>
                  {entry.rank}位 {name(entry.playerId)}
                </strong>
                <span className="block text-lg">
                  生存 {entry.survivedQuestions}問
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {state.phase === 'results' && revealed >= 2 && (
        <p className="text-xl text-white/70">次の問題をお待ちください。</p>
      )}
    </div>
  );
};
