'use client';
import { useEffect, useState, type FC } from 'react';
import { GAME_CONFIG } from '@/config/game';
import type { GameSnapshot } from '@/types/game';
import { remainingSeconds, type ServerClock } from '@/lib/server-clock';
import { MonitorResults } from './MonitorResults';
import type { ResultPresentation } from '@/lib/result-presentation';
import { ChoiceImage } from './ChoiceImage';
type Props = {
  state: GameSnapshot;
  clock: ServerClock | null;
  presentation?: ResultPresentation | null;
  reducedMotion?: boolean;
};
export const MonitorView: FC<Props> = ({
  state,
  clock,
  presentation = null,
  reducedMotion = false,
}) => {
  const [remaining, setRemaining] = useState(() =>
    remainingSeconds(state.deadlineAt, clock)
  );
  useEffect(() => {
    const update = () =>
      setRemaining(remainingSeconds(state.deadlineAt, clock));
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [state.deadlineAt, clock]);
  const players = state.players.filter((player) => !player.leftAt);
  const survivors = players.filter((player) => !player.isEliminated);
  const asking =
    !!state.question &&
    (state.phase === 'playing' || state.phase === 'closing');
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap justify-between items-center gap-6">
        <div>
          <h1 className="text-3xl lg:text-5xl font-black">All Star Quiz</h1>
          <p className="text-xl mt-2">
            ルーム{' '}
            <span className="font-mono tracking-widest">{state.code}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-8 text-2xl lg:text-4xl font-bold">
          <p>参加者 {players.length}人</p>
          <p>生存者 {survivors.length}人</p>
          {asking && (
            <p role="status">
              回答 {state.answerCount} / {survivors.length}人
            </p>
          )}
        </div>
      </header>
      {asking ? (
        <section aria-label="出題中" className="space-y-6">
          <p
            role="timer"
            aria-label="残り時間"
            className={`text-right text-5xl lg:text-7xl font-black ${remaining <= 3 ? 'text-red-300' : 'text-yellow-200'}`}
          >
            {state.phase === 'closing' || remaining <= 0
              ? '回答締切'
              : `残り ${Math.ceil(remaining)} 秒`}
          </p>
          <h2 className="text-3xl lg:text-5xl leading-relaxed font-bold whitespace-pre-wrap break-words">
            {state.question!.question}
          </h2>
          <div className="grid md:grid-cols-2 gap-5" aria-label="選択肢一覧">
            {GAME_CONFIG.CHOICES.map((choice) => {
              const image = state.question!.choiceImages?.[choice];
              return (
                <div
                  key={choice}
                  className="rounded-xl border-2 border-white/40 bg-white/10 p-5 lg:p-7 min-w-0"
                >
                  <h3 className="text-3xl lg:text-4xl font-bold mb-3">
                    {choice}
                  </h3>
                  {image && (
                    <ChoiceImage
                      key={image.url}
                      url={image.url}
                      alt={image.alt}
                    />
                  )}
                  <p className="text-2xl lg:text-3xl whitespace-pre-wrap break-words">
                    {state.question!.choices[choice]}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : state.phase === 'results' || state.phase === 'finished' ? (
        <MonitorResults
          key={state.lastResult?.questionId || state.gameId}
          state={state}
          presentation={presentation}
          reducedMotion={reducedMotion}
        />
      ) : (
        <section className="space-y-6" aria-label="参加状況">
          <h2 className="text-4xl lg:text-6xl font-bold">
            {state.phase === 'waiting' ? '参加者を募集中' : 'ゲームを同期中'}
          </h2>
          <p className="text-2xl">
            {state.phase === 'waiting'
              ? 'スマートフォンからルームコードを入力して参加してください。'
              : '手元の画面で結果をご確認ください。'}
          </p>
          <ul
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"
            aria-label="参加者一覧"
          >
            {players.map((player) => (
              <li
                key={player.id}
                className={`rounded-lg p-5 text-2xl break-words ${player.isEliminated ? 'bg-white/5 text-white/60' : 'bg-white/15'}`}
              >
                {player.name}
                <span className="block text-lg mt-2">
                  {player.isEliminated
                    ? '脱落・観戦中'
                    : player.isHost
                      ? 'ホスト'
                      : '参加中'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-lg text-white/60">
        閲覧専用モニター・回答は参加者の画面から送信してください。
      </p>
    </div>
  );
};
