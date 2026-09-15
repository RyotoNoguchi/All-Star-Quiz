'use client';
import { useEffect, useState, type FC } from 'react';
import { useRouter } from 'next/navigation';
import type { z } from 'zod';
import type { questionSnapshotSchema } from '@/lib/question-schema';
import { api, apiErrorStatus } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { QuestionEditor } from './QuestionEditor';
type Question = z.infer<typeof questionSnapshotSchema>;
export const QuestionManager: FC = () => {
  const router = useRouter();
  const [items, setItems] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{ initial: Question | null } | null>(
    null
  );
  const unauthorized = () => router.replace('/admin/login');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api.questions.list
      .query(
        { offset, limit: 20, ...(filter ? { category: filter } : {}) },
        { signal: controller.signal }
      )
      .then((result) => {
        if (!controller.signal.aborted) {
          setItems(result.items);
          setTotal(result.total);
        }
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (apiErrorStatus(cause) === 401) router.replace('/admin/login');
        else setError('一覧を取得できませんでした。再読み込みしてください。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, filter, revision, router]);
  if (editor)
    return (
      <QuestionEditor
        initial={editor.initial}
        onUnauthorized={unauthorized}
        onCancel={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          setOffset(0);
          setRevision((value) => value + 1);
        }}
      />
    );
  return (
    <section className="space-y-5" aria-label="問題管理">
      <h2 className="text-2xl font-bold">問題一覧</h2>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setEditor({ initial: null })}>問題を追加</Button>
        <Button
          onClick={() => setRevision((value) => value + 1)}
          disabled={loading}
        >
          一覧を再読み込み
        </Button>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
          setFilter(category.trim());
        }}
      >
        <label>
          カテゴリで絞り込む
          <input
            maxLength={50}
            className="block rounded border p-2 bg-slate-900 text-white"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </label>
        <Button type="submit">絞り込む</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">一覧を読み込んでいます…</p>
      ) : (
        <>
          <p>全{total}問</p>
          <ul className="space-y-3">
            {items.map((question) => (
              <li
                key={question.id}
                className="rounded bg-white/10 p-4 space-y-2"
              >
                <h3 className="font-bold whitespace-pre-wrap break-words">
                  {question.question}
                </h3>
                <p>
                  {question.type === 'final' ? '最終問題' : '通常問題'} ·{' '}
                  {question.category || 'カテゴリなし'} · 正解 {question.answer}
                </p>
                <Button onClick={() => setEditor({ initial: question })}>
                  編集・プレビュー
                </Button>
              </li>
            ))}
          </ul>
          {!items.length && (
            <p>
              問題がありません。カテゴリを変更するか、問題を追加してください。
            </p>
          )}
          <div className="flex gap-3">
            <Button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              前の20問
            </Button>
            <Button
              disabled={offset + 20 >= total}
              onClick={() => setOffset(offset + 20)}
            >
              次の20問
            </Button>
          </div>
        </>
      )}
    </section>
  );
};
