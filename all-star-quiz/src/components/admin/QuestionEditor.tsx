'use client';
import { useState, type FC } from 'react';
import type { z } from 'zod';
import type { questionSnapshotSchema } from '@/lib/question-schema';
import { questionFields } from '@/lib/question-schema';
import { api, apiErrorStatus } from '@/lib/api-client';
import { GAME_CONFIG } from '@/config/game';
import { ChoiceImage } from '@/components/game/ChoiceImage';
import { Button } from '@/components/ui/button';
type Question = z.infer<typeof questionSnapshotSchema>;
type Props = {
  initial: Question | null;
  onSaved: () => void;
  onCancel: () => void;
  onUnauthorized: () => void;
};
const empty = (): z.infer<typeof questionFields> => ({
  question: '',
  choices: { A: '', B: '', C: '', D: '' },
  choiceImages: {},
  answer: 'A',
  type: 'normal',
  timeLimit: 10,
  category: null,
  explanation: null,
});
const inputClass =
  'w-full rounded border border-white/40 bg-slate-900 text-white p-3';
export const QuestionEditor: FC<Props> = ({
  initial,
  onSaved,
  onCancel,
  onUnauthorized,
}) => {
  const [draft, setDraft] = useState(() =>
    initial
      ? questionFields.parse(
          Object.fromEntries(
            Object.entries(initial).filter(
              ([key]) => key !== 'id' && key !== 'version'
            )
          )
        )
      : empty()
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fail = (cause: unknown) => {
    if (apiErrorStatus(cause) === 401) {
      onUnauthorized();
      return;
    }
    setError(cause instanceof Error ? cause.message : '保存できませんでした。');
  };
  const save = async () => {
    const parsed = questionFields.safeParse(draft);
    if (!parsed.success) {
      setError(
        '問題文・4つの選択肢・画像の説明を入力し、文字数と画像URLを確認してください。'
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (initial)
        await api.questions.update.mutate({
          ...parsed.data,
          id: initial.id,
          version: initial.version,
        });
      else await api.questions.create.mutate(parsed.data);
      onSaved();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="space-y-5 rounded-xl bg-white/10 p-5"
      aria-label="問題編集"
    >
      <h2 className="text-2xl font-bold">
        {initial ? '問題を編集' : '問題を追加'}
      </h2>
      <p>
        保存済みの出題セットには編集・削除は反映されません。変更を使うには、開始前にホストが問題を再選択してください。
      </p>
      {error && (
        <p role="alert" className="border border-red-300 p-3">
          {error}
        </p>
      )}
      {busy && <p role="status">処理しています…</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy} className="space-y-5">
          <label className="block">
            問題文（500文字まで）
            <textarea
              required
              maxLength={500}
              className={inputClass}
              value={draft.question}
              onChange={(event) =>
                setDraft({ ...draft, question: event.target.value })
              }
            />
          </label>
          <div className="grid md:grid-cols-2 gap-4">
            {GAME_CONFIG.CHOICES.map((choice) => (
              <div
                key={choice}
                className="space-y-3 border border-white/30 rounded p-4"
              >
                <label className="block">
                  選択肢 {choice}（200文字まで）
                  <input
                    required
                    maxLength={200}
                    className={inputClass}
                    value={draft.choices[choice]}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        choices: {
                          ...draft.choices,
                          [choice]: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className="block">
                  画像URL {choice}
                  <input
                    className={inputClass}
                    value={draft.choiceImages[choice]?.url || ''}
                    onChange={(event) => {
                      const images = { ...draft.choiceImages };
                      if (!event.target.value) delete images[choice];
                      else
                        images[choice] = {
                          url: event.target.value,
                          alt: images[choice]?.alt || '',
                        };
                      setDraft({ ...draft, choiceImages: images });
                    }}
                  />
                </label>
                <label className="block">
                  画像ファイル {choice}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="block max-w-full"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        setError('画像は2MB以下にしてください。');
                        return;
                      }
                      setBusy(true);
                      setError('');
                      try {
                        const response = await fetch('/api/question-images', {
                          method: 'POST',
                          body: file,
                          credentials: 'same-origin',
                        });
                        const result = await response.json();
                        if (response.status === 401) {
                          onUnauthorized();
                          return;
                        }
                        if (!response.ok)
                          throw new Error(
                            result.error || '画像を登録できませんでした。'
                          );
                        setDraft((current) => ({
                          ...current,
                          choiceImages: {
                            ...current.choiceImages,
                            [choice]: {
                              url: result.url,
                              alt:
                                current.choiceImages[choice]?.alt ||
                                current.choices[choice],
                            },
                          },
                        }));
                      } catch (cause) {
                        fail(cause);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
                {draft.choiceImages[choice] && (
                  <label className="block">
                    画像の説明 {choice}
                    <input
                      required
                      maxLength={200}
                      className={inputClass}
                      value={draft.choiceImages[choice]?.alt || ''}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          choiceImages: {
                            ...draft.choiceImages,
                            [choice]: {
                              url: draft.choiceImages[choice]!.url,
                              alt: event.target.value,
                            },
                          },
                        })
                      }
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
          <p>
            画像はHTTPS
            URLまたは登録済み画像を指定できます。ファイルは2MB以下、縦横4096ピクセル以下の静止画PNG・JPEG・WebPです。URLの画像は提供元の変更・削除で表示できなくなることがあります。
          </p>
          <label className="block">
            正解
            <select
              className={inputClass}
              value={draft.answer}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  answer: event.target.value as typeof draft.answer,
                })
              }
            >
              {GAME_CONFIG.CHOICES.map((choice) => (
                <option key={choice}>{choice}</option>
              ))}
            </select>
          </label>
          <label className="block">
            問題の種類
            <select
              className={inputClass}
              value={draft.type}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  type: event.target.value as typeof draft.type,
                })
              }
            >
              <option value="normal">通常問題</option>
              <option value="final">最終問題</option>
            </select>
          </label>
          <label className="block">
            カテゴリ（50文字まで）
            <input
              className={inputClass}
              maxLength={50}
              value={draft.category || ''}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value || null })
              }
            />
          </label>
          <label className="block">
            解説（2000文字まで）
            <textarea
              className={inputClass}
              maxLength={2000}
              value={draft.explanation || ''}
              onChange={(event) =>
                setDraft({ ...draft, explanation: event.target.value || null })
              }
            />
          </label>
          <p>
            回答時間：10秒。最終問題の指定は結果発表まで参加者には公開しません。
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">保存する</Button>
            <Button
              type="button"
              variant="outline"
              className="text-slate-900"
              onClick={onCancel}
            >
              キャンセル
            </Button>
            {initial && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                削除する
              </Button>
            )}
          </div>
          {confirmDelete && initial && (
            <div role="alert" className="border border-red-300 p-4 space-y-3">
              <p>
                この問題を一覧と今後の出題候補から削除します。保存済みのゲームには残ります。
              </p>
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await api.questions.delete.mutate({
                      id: initial.id,
                      version: initial.version,
                    });
                    onSaved();
                  } catch (cause) {
                    fail(cause);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                削除を確定
              </Button>
              <Button type="button" onClick={() => setConfirmDelete(false)}>
                削除をやめる
              </Button>
            </div>
          )}
        </fieldset>
      </form>
      <section
        aria-label="出題プレビュー"
        className="space-y-4 border-t border-white/40 pt-5"
      >
        <h3 className="text-2xl font-bold">出題プレビュー</h3>
        <p className="text-2xl whitespace-pre-wrap break-words">
          {draft.question || '問題文を入力してください'}
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          {GAME_CONFIG.CHOICES.map((choice) => (
            <div key={choice} className="min-w-0 rounded bg-white/10 p-4">
              <strong>{choice}</strong>
              {draft.choiceImages[choice] &&
                questionFields.shape.choiceImages.safeParse(draft.choiceImages)
                  .success && (
                  <ChoiceImage
                    key={draft.choiceImages[choice]!.url}
                    {...draft.choiceImages[choice]!}
                  />
                )}
              <p className="whitespace-pre-wrap break-words">
                {draft.choices[choice] || '選択肢を入力してください'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
};
