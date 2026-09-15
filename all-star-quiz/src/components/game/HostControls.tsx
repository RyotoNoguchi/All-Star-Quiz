'use client';
import { useEffect, useRef, useState, type FC } from 'react';
import Link from 'next/link';
import { api, apiErrorStatus } from '@/lib/api-client';
import type { HostCommand, PrivateGameSnapshot } from '@/types/game';
import { Button } from '@/components/ui/button';
type Props = {
  state: PrivateGameSnapshot;
  connected: boolean;
  onSync: () => void;
};
type Status = {
  version: number;
  preparedCount: number;
  players: { id: string; connected: boolean }[];
};
export const HostControls: FC<Props> = ({ state, connected, onSync }) => {
  const isHost = state.hostId === state.playerId;
  const wasHost = useRef(isHost);
  const [details, setDetails] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const pending = useRef<HostCommand | null>(null);
  const [retryCommand, setRetryCommand] = useState(false);
  const [requiredVersion, setRequiredVersion] = useState(0);
  const [count, setCount] = useState(5);
  const [category, setCategory] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [revision, setRevision] = useState(0);
  const [authorized, setAuthorized] = useState(true);
  useEffect(() => {
    if (!isHost) {
      setDetails(null);
      pending.current = null;
      setRetryCommand(false);
      return;
    }
    wasHost.current = true;
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const result = await api.host.status.query(
          { code: state.code },
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setDetails(result);
          setAuthorized(true);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setDetails(null);
          if ([401, 403].includes(apiErrorStatus(cause) || 0))
            setAuthorized(false);
        }
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [isHost, state.code, state.version, revision]);
  const locked =
    busy || !connected || !authorized || state.version < requiredVersion;
  const command = async (action: HostCommand['action']) => {
    if (inFlight.current || locked) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const input = pending.current || {
      gameId: state.gameId,
      requestId: crypto.randomUUID(),
      expectedVersion: state.version,
      action,
    };
    pending.current = input;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const result = await api.games.command.mutate(input, {
        signal: controller.signal,
      });
      pending.current = null;
      setRetryCommand(false);
      setRequiredVersion(result.version);
      setConfirmCancel(false);
      setNotice('操作を受け付けました。最新状態に切り替わります。');
      setRevision((value) => value + 1);
    } catch (cause) {
      const status = apiErrorStatus(cause);
      if (!status || status >= 500 || status === 429) {
        setRetryCommand(true);
        setError('操作結果を確認できません。同じ操作を再確認してください。');
      } else {
        pending.current = null;
        setRetryCommand(false);
        setError(
          cause instanceof Error ? cause.message : '操作できませんでした。'
        );
      }
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setBusy(false);
    }
  };
  if (!isHost)
    return wasHost.current ? (
      <p role="status">
        ホストが変更されました。進行操作は新しいホストが行います。
      </p>
    ) : null;
  return (
    <section
      className="space-y-4 border border-yellow-200/50 rounded-xl p-4"
      aria-label="ホストの進行操作"
    >
      <h2 className="text-xl font-bold">ホストの進行操作</h2>
      <Button disabled={busy} onClick={onSync}>
        最新状態を取得
      </Button>
      {!authorized && (
        <p role="alert">
          ホスト権限を確認できません。最新状態を取得してください。
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">処理しています…</p>}
      {!connected && <p>再接続が完了すると操作できます。</p>}
      <p>
        回答 {state.answerCount}件 · 生存者{' '}
        {
          state.players.filter(
            (player) => !player.leftAt && !player.isEliminated
          ).length
        }
        人
      </p>
      <ul aria-label="参加者の接続状況" className="space-y-1">
        {state.players
          .filter((player) => !player.leftAt)
          .map((player) => (
            <li key={player.id}>
              {player.name}：
              {details
                ? details.players.find((entry) => entry.id === player.id)
                    ?.connected
                  ? '接続中'
                  : '未接続・切断中'
                : '接続状況を確認中'}
              {player.isEliminated ? '（脱落・観戦中）' : ''}
            </li>
          ))}
      </ul>
      <p className="text-sm">
        接続状況は約5秒ごとに確認します。切断直後は接続中の表示が残る場合があります。
      </p>
      {state.phase === 'waiting' && (
        <fieldset disabled={locked || retryCommand} className="space-y-3">
          <label className="block">
            出題数（最終問題を含む）
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              className="block border rounded bg-slate-900 p-2 text-white"
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </label>
          <label className="block">
            出題カテゴリ（空欄はすべて）
            <input
              maxLength={50}
              value={category}
              className="block border rounded bg-slate-900 p-2 text-white"
              onChange={(event) => setCategory(event.target.value)}
            />
          </label>
          <Button
            onClick={async () => {
              if (inFlight.current) return;
              if (!Number.isInteger(count) || count < 1 || count > 50) {
                setError('出題数は1〜50で指定してください。');
                return;
              }
              inFlight.current = true;
              setBusy(true);
              setError('');
              try {
                const result = await api.questions.prepareGame.mutate({
                  code: state.code,
                  count,
                  ...(category.trim() ? { category: category.trim() } : {}),
                });
                setRequiredVersion(result.version);
                setNotice(
                  `${result.count}問を準備しました。最後の1問は最終問題です。`
                );
                setRevision((value) => value + 1);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : '問題を準備できませんでした。'
                );
                setRevision((value) => value + 1);
              } finally {
                inFlight.current = false;
                setBusy(false);
              }
            }}
          >
            問題セットを準備する
          </Button>
          <p>
            {details
              ? `準備済み：${details.preparedCount}問`
              : '準備状況を確認しています…'}
          </p>
          <Button
            disabled={
              !details?.preparedCount ||
              state.players.filter((player) => !player.leftAt).length < 2
            }
            onClick={() => void command('start')}
          >
            ゲームを開始
          </Button>
          <p className="text-sm">
            2人以上の参加と問題セットの準備が必要です。準備し直すと通常問題を選び直します。
          </p>
        </fieldset>
      )}
      {(state.phase === 'playing' || state.phase === 'closing') && (
        <p>回答は自動で締め切ります。結果が確定するまでお待ちください。</p>
      )}
      {state.phase === 'results' && (
        <Button
          disabled={locked || retryCommand}
          onClick={() => void command('next')}
        >
          次の問題へ
        </Button>
      )}
      {retryCommand && (
        <Button
          disabled={locked}
          onClick={() => void command(pending.current!.action)}
        >
          同じ操作を再確認
        </Button>
      )}
      {state.phase !== 'finished' && (
        <>
          <Button
            variant="destructive"
            disabled={locked || retryCommand}
            onClick={() => setConfirmCancel(true)}
          >
            ゲームを終了・中止
          </Button>
          {confirmCancel && (
            <div role="alert" className="space-y-3">
              <p>
                ゲームを中止して結果を確定します。続きの問題には進めなくなります。
              </p>
              <Button
                variant="destructive"
                disabled={locked || retryCommand}
                onClick={() => void command('cancel')}
              >
                中止を確定
              </Button>
              <Button disabled={locked} onClick={() => setConfirmCancel(false)}>
                中止をやめる
              </Button>
            </div>
          )}
        </>
      )}
      <Link
        href={`/monitor?room=${state.code}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block underline"
      >
        大画面モニターを開く
      </Link>
    </section>
  );
};
