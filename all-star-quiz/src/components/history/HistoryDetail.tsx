import type { FC } from 'react';
import type { z } from 'zod';
import type { historyDetailSchema } from '@/lib/history-schema';
import { finishLabels, eliminationLabels } from '@/lib/game-labels';
type Props = { detail: z.infer<typeof historyDetailSchema> };
export const HistoryDetail: FC<Props> = ({ detail: { result, questions } }) => (
  <article className="space-y-6" aria-label="個人成績の詳細">
    <header className="space-y-2">
      <h2 className="text-2xl font-bold break-words">
        {result.playerName} の成績
      </h2>
      <p className="text-white/80">
        {new Date(result.completedAt).toLocaleString('ja-JP')} ／ ルーム{' '}
        {result.code}
      </p>
      <p className="text-2xl font-bold text-yellow-200">
        {result.isWinner ? '優勝！ ' : ''}
        {result.rank}位・生存 {result.survivedQuestions}問
      </p>
      <p>{finishLabels[result.reason]}</p>
      {result.eliminationReason && (
        <p>
          {result.eliminatedAtQuestion === 0
            ? '開始前'
            : `第${result.eliminatedAtQuestion}問`}
          ：{eliminationLabels[result.eliminationReason]}
        </p>
      )}
      <p className="text-sm text-white/80">
        出題 {result.totalQuestions}問。同じ到達状況の参加者は同順位です。
      </p>
    </header>
    <h3 className="text-xl font-bold">自分の回答を振り返る</h3>
    <p className="text-sm text-white/80">
      参加していた問題のうち、結果が公開された問題を表示しています。
    </p>
    {questions.length === 0 && <p>振り返れる問題はまだありません。</p>}
    <ol className="space-y-4">
      {questions.map((question) => (
        <li
          key={question.number}
          className="rounded-xl border border-white/20 bg-white/5 p-4 space-y-3 break-words"
        >
          <h4 className="font-bold">
            第{question.number}問：{question.question}
          </h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(['A', 'B', 'C', 'D'] as const).map((choice) => (
              <li
                key={choice}
                className={
                  choice === question.correctAnswer ? 'text-yellow-200' : ''
                }
              >
                {choice}：{question.choices[choice]}
                {choice === question.correctAnswer ? '（正解）' : ''}
              </li>
            ))}
          </ul>
          <p>
            {question.ownAnswer
              ? `あなたの回答：${question.ownAnswer.choice}（${question.ownAnswer.isCorrect ? '正解' : '不正解'}）・${(question.ownAnswer.responseTime / 1000).toFixed(3)}秒`
              : 'あなたの回答：未回答'}
          </p>
          {question.explanation && (
            <p className="border-t border-white/20 pt-3">
              解説：{question.explanation}
            </p>
          )}
        </li>
      ))}
    </ol>
  </article>
);
