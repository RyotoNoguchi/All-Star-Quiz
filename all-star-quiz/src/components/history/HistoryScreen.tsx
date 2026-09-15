'use client';
import { useEffect, useState, type FC } from 'react';
import Link from 'next/link';
import { api, apiErrorStatus } from '@/lib/api-client';
import {
  readLastHistoryGame,
  rememberHistoryGame,
} from '@/lib/history-preference';
import { Button } from '@/components/ui/button';
import { HistoryDetail } from './HistoryDetail';
type Data = {
  list: Awaited<ReturnType<typeof api.history.list.query>>;
  stats: Awaited<ReturnType<typeof api.history.stats.query>>;
  detail: Awaited<ReturnType<typeof api.history.detail.query>> | null;
};
export const HistoryScreen: FC = () => {
  const [selected, setSelected] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('game');
    if (id && /^[0-9a-f-]{36}$/.test(id)) setSelected(id);
    setLast(readLastHistoryGame());
    setReady(true);
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError('');
    setUnauthorized(false);
    setData(null);
    const expire = () => {
      setUnauthorized(true);
      setData(null);
      setLast(null);
      rememberHistoryGame(null);
    };
    Promise.all([
      api.history.list.query(
        { offset, limit: 20 },
        { signal: controller.signal }
      ),
      api.history.stats.query(undefined, { signal: controller.signal }),
      selected
        ? api.history.detail.query(
            { gameId: selected },
            { signal: controller.signal }
          )
        : Promise.resolve(null),
    ])
      .then(([list, stats, detail]) => {
        if (disposed) return;
        const remaining =
          new Date(list.sessionExpiresAt).getTime() - Date.now();
        if (remaining <= 0) {
          expire();
          return;
        }
        setUnauthorized(false);
        setData({ list, stats, detail });
        // Browser timers are signed 32-bit. Revalidate longer sessions daily.
        expiry = setTimeout(
          () => setRevision((value) => value + 1),
          Math.min(remaining, 86400000)
        );
        if (detail) {
          rememberHistoryGame(detail.result.gameId);
          setLast(detail.result.gameId);
        }
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        if (apiErrorStatus(cause) === 401) expire();
        else
          setError(
            apiErrorStatus(cause) === 404
              ? 'この履歴は見つかりません。自分の履歴一覧から選び直してください。'
              : '履歴を読み込めませんでした。通信状態を確認して、もう一度お試しください。'
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timeout);
      clearTimeout(expiry);
    };
  }, [ready, selected, offset, revision]);
  const select = (id: string | null) => {
    setSelected(id);
    window.history.replaceState(
      null,
      '',
      id ? `/history?game=${id}` : '/history'
    );
  };
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <nav
        className="flex flex-wrap gap-4 items-center"
        aria-label="履歴の移動"
      >
        <Link className="underline" href="/">
          参加画面へ
        </Link>
        {selected && (
          <Button onClick={() => select(null)}>履歴一覧へ戻る</Button>
        )}
        <Button
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          再読み込み
        </Button>
      </nav>
      {loading ? (
        <p role="status">履歴を読み込んでいます…</p>
      ) : unauthorized ? (
        <section role="status" className="space-y-3">
          <h2 className="text-xl font-bold">
            このブラウザーでは履歴を確認できません
          </h2>
          <p>
            まだゲームに参加していないか、参加情報の期限が切れています。参加していたブラウザーで開いてください。
          </p>
          <p>Cookieを削除した場合、以前の履歴にはアクセスできません。</p>
        </section>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        data && (
          <>
            {data.detail ? (
              <HistoryDetail detail={data.detail} />
            ) : (
              <>
                <h2 className="text-2xl font-bold">これまでの成績</h2>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ['参加ゲーム', `${data.stats.games}回`],
                    ['優勝', `${data.stats.wins}回`],
                    ['平均生存', `${data.stats.averageSurvived.toFixed(1)}問`],
                    ['最高記録', `${data.stats.bestSurvived}問`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-white/10 p-4">
                      <dt className="text-sm text-white/80">{label}</dt>
                      <dd className="text-2xl font-bold mt-1">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-sm text-white/80">
                  終了・中断した全ゲームが対象です。最高記録は生存問題数の最大値です。
                </p>
                {data.list.total === 0 ? (
                  <p role="status">
                    まだ終了したゲームの履歴がありません。ゲームが終了すると、ここに成績が保存されます。
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap justify-between gap-3 items-center">
                      <h3 className="text-xl font-bold">ゲーム履歴</h3>
                      {last && (
                        <Button onClick={() => select(last)}>
                          前回見た履歴
                        </Button>
                      )}
                    </div>
                    <ol className="space-y-3">
                      {data.list.items.map((item) => (
                        <li key={item.gameId}>
                          <button
                            type="button"
                            onClick={() => select(item.gameId)}
                            className="w-full text-left rounded-xl border border-white/20 bg-white/5 p-4 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-yellow-300 space-y-2"
                          >
                            <span className="block text-sm text-white/80">
                              {new Date(item.completedAt).toLocaleString(
                                'ja-JP'
                              )}
                              ・{item.code}
                            </span>
                            <span className="block break-words font-bold">
                              {item.playerName}：{item.isWinner ? '優勝・' : ''}
                              {item.rank}位 ／ 生存 {item.survivedQuestions}問
                            </span>
                            <span className="block text-sm underline">
                              問題と自分の回答を見る →
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - 20))}
                      >
                        前のページ
                      </Button>
                      <span>
                        {Math.min(offset + 1, data.list.total)}–
                        {Math.min(offset + 20, data.list.total)} /{' '}
                        {data.list.total}件
                      </span>
                      <Button
                        disabled={offset + 20 >= data.list.total}
                        onClick={() => setOffset(offset + 20)}
                      >
                        次のページ
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
            <p className="border-t border-white/20 pt-4 text-sm text-white/80">
              このブラウザーの参加情報の有効期限：
              {new Date(data.list.sessionExpiresAt).toLocaleString('ja-JP')}
              。Cookieを削除すると以前の履歴にはアクセスできません。履歴を別端末へ引き継ぐ機能はありません。
            </p>
          </>
        )
      )}
    </div>
  );
};
