'use client';
import { useEffect, useState, type FC } from 'react';
import { ChoiceImage } from './ChoiceImage';
import { GAME_CONFIG } from '@/config/game';
import type { PrivateGameSnapshot } from '@/types/game';
import { remainingSeconds, type ServerClock } from '@/lib/server-clock';
import { useAnswer } from '@/hooks/use-answer';
import { QuizButton } from './QuizButton';
import { Button } from '@/components/ui/button';
type Props = {
  state: PrivateGameSnapshot;
  connected: boolean;
  clock: ServerClock | null;
};
export const PlayerQuestion: FC<Props> = ({ state, connected, clock }) => {
  const [remaining, setRemaining] = useState(() =>
    remainingSeconds(state.deadlineAt, clock)
  );
  const answer = useAnswer(state);
  useEffect(() => {
    const update = () =>
      setRemaining(remainingSeconds(state.deadlineAt, clock));
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [state.deadlineAt, clock]);
  const player = state.players.find((item) => item.id === state.playerId);
  const disabled =
    !connected ||
    state.phase !== 'playing' ||
    remaining <= 0 ||
    !!player?.isEliminated ||
    !!answer.pending ||
    !!answer.accepted ||
    answer.sending;
  if (!state.question) return null;
  return (
    <section aria-label="現在の問題" className="space-y-5">
      <div className="flex justify-between items-center gap-3">
        <p className="text-white/80">回答 {state.answerCount} 人</p>
        <p
          role="timer"
          aria-label="残り時間"
          className={`text-3xl font-bold ${remaining <= 3 ? 'text-red-300' : ''}`}
        >
          残り {Math.ceil(remaining)} 秒
        </p>
      </div>
      <h2 className="text-xl sm:text-2xl font-bold whitespace-pre-wrap break-words">
        {state.question.question}
      </h2>
      <p className="text-sm text-white/80">
        選択肢を押すと回答を送信します。送信後は変更できません。
      </p>
      <div className="grid gap-3">
        {GAME_CONFIG.CHOICES.map((choice) => {
          const image = state.question!.choiceImages?.[choice];
          return (
            <QuizButton
              key={choice}
              choice={choice}
              label={state.question!.choices[choice]}
              disabled={disabled}
              isSelected={
                (answer.accepted?.choice || answer.pending?.choice) === choice
              }
              onClick={(selected) => {
                // Check the clock again at activation, between timer ticks as well.
                if (!disabled && remainingSeconds(state.deadlineAt, clock) > 0)
                  void answer.submit(selected);
              }}
            >
              <span className="block min-w-0">
                {image && (
                  <ChoiceImage
                    key={image.url}
                    url={image.url}
                    alt={image.alt}
                  />
                )}
                <span>{state.question!.choices[choice]}</span>
              </span>
            </QuizButton>
          );
        })}
      </div>
      <p role="status" className="rounded-lg bg-white/10 p-4">
        {answer.accepted
          ? `回答 ${answer.accepted.choice} を受け付けました。結果発表をお待ちください。`
          : answer.sending
            ? '回答を送信しています…'
            : player?.isEliminated
              ? '観戦中です。次の結果発表をお待ちください。'
              : state.phase !== 'playing' || remaining <= 0
                ? '回答を締め切りました。結果発表をお待ちください。'
                : !connected
                  ? '接続が戻るまで回答できません。'
                  : answer.pending
                    ? '送信した回答の受付を確認してください。'
                    : '回答を選んでください。'}
      </p>
      {answer.error && (
        <p role="alert" className="text-red-200">
          {answer.error}
        </p>
      )}
      {answer.retryable && !answer.accepted && (
        <Button
          disabled={!connected || answer.sending}
          onClick={() => void answer.submit()}
        >
          同じ回答を再送する
        </Button>
      )}
    </section>
  );
};
