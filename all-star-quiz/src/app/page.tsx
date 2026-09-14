'use client';

import { useEffect, useState, useRef, type FC, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { PlayerResult } from '@/components/game/PlayerResult';
import { PlayerFinalResult } from '@/components/game/PlayerFinalResult';
import { PlayerQuestion } from '@/components/game/PlayerQuestion';
import { GameLayout } from '@/components/layout/GameLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useGameConnection,
  announceRoomDeparture,
} from '@/hooks/use-game-connection';

const Home: FC = () => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [activeCode, setActiveCode] = useState('');
  const {
    state: view,
    status,
    message,
    retry,
    clock,
  } = useGameConnection(activeCode);
  const operation = useRef(0);
  useEffect(
    () => () => {
      operation.current++;
    },
    []
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const initial =
      new URLSearchParams(window.location.search).get('room') || '';
    setCode(initial.toUpperCase());
    if (/^[A-Fa-f0-9]{6}$/.test(initial)) setActiveCode(initial.toUpperCase());
  }, []);

  useEffect(() => {
    if (status !== 'denied') return;
    setActiveCode('');
    setError(message);
    window.history.replaceState(null, '', '/');
  }, [status, message]);

  const submit = async (action: 'create' | 'join' | 'leave') => {
    const current = ++operation.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const roomCode = view?.code || code;
      if (action === 'leave' && view?.phase === 'finished') {
        setActiveCode('');
        window.history.replaceState(null, '', '/');
        return;
      }
      const data =
        action === 'create'
          ? await api.rooms.create.mutate({ name })
          : action === 'join'
            ? await api.rooms.join.mutate({ name, code: roomCode })
            : view && view.phase !== 'waiting'
              ? await api.games.leave.mutate({ gameId: view.gameId })
              : await api.rooms.leave.mutate({ code: roomCode });
      if (current !== operation.current) return;
      if (action === 'leave') {
        setActiveCode('');
        announceRoomDeparture(roomCode);
        window.history.replaceState(null, '', '/');
      } else if ('room' in data) {
        setActiveCode(data.room.code);
        window.history.replaceState(null, '', `/?room=${data.room.code}`);
      }
    } catch (cause) {
      if (current !== operation.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : '接続できませんでした。もう一度お試しください。'
      );
    } finally {
      if (current === operation.current) setBusy(false);
    }
  };

  const join = (event: FormEvent) => {
    event.preventDefault();
    void submit('join');
  };
  return (
    <GameLayout title="🌟 All Star Quiz">
      <div className="max-w-xl mx-auto space-y-6">
        {error && (
          <p role="alert" className="rounded-lg bg-red-950 p-4 text-white">
            {error}
          </p>
        )}
        {activeCode && (
          <div role="status" className="rounded-lg bg-white/10 p-3 text-sm">
            {status === 'connected'
              ? '接続済み・最新の状態です'
              : message || '接続しています…'}
            {status === 'failed' && (
              <Button className="ml-3" onClick={retry}>
                再接続する
              </Button>
            )}
          </div>
        )}
        {view ? (
          <>
            {view.question &&
            (view.phase === 'playing' || view.phase === 'closing') ? (
              <PlayerQuestion
                key={`${view.gameId}:${view.playerId}:${view.question.id}`}
                state={view}
                connected={status === 'connected'}
                clock={clock}
              />
            ) : view.phase === 'finished' ? (
              <PlayerFinalResult state={view} />
            ) : view.phase === 'results' && view.lastResult ? (
              <PlayerResult state={view} />
            ) : (
              <>
                <div className="text-center space-y-3">
                  <p className="text-white/70">
                    {view.phase === 'waiting'
                      ? '参加者を募集中'
                      : 'ゲーム進行中'}
                  </p>
                  <h2 className="text-2xl font-bold">
                    {view.phase === 'waiting'
                      ? 'クイズの待合室'
                      : 'クイズルーム'}
                  </h2>
                  <p>ルームコード</p>
                  <p className="text-4xl font-mono tracking-widest font-bold">
                    {view.code}
                  </p>
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          window.location.href
                        );
                        setNotice('招待リンクをコピーしました。');
                      } catch {
                        setNotice(
                          'アドレスバーのURL、またはルームコードを共有してください。'
                        );
                      }
                    }}
                  >
                    招待リンクをコピー
                  </Button>
                  <p role="status" className="text-sm">
                    {notice}
                  </p>
                </div>
                <h3 className="font-bold">
                  参加者{' '}
                  {view.players.filter((player) => !player.leftAt).length} /
                  20人
                </h3>
                <ul className="space-y-2" aria-label="参加者一覧">
                  {view.players
                    .filter((player) => !player.leftAt)
                    .map((player) => (
                      <li
                        key={player.id}
                        className="flex justify-between rounded-lg bg-white/10 p-4"
                      >
                        <span>
                          {player.name}
                          {player.id === view.playerId ? '（あなた）' : ''}
                        </span>
                        {player.isHost && (
                          <span className="text-yellow-300">ホスト</span>
                        )}
                      </li>
                    ))}
                </ul>
                <p className="text-sm text-white/70">
                  {view.phase === 'waiting'
                    ? '参加者一覧とホストは自動で更新されます。開始すると問題が表示されます。'
                    : '次の案内をお待ちください。'}
                </p>
              </>
            )}
            <Button
              disabled={busy}
              onClick={() => void submit('leave')}
              variant="destructive"
            >
              {view.phase === 'finished' ? '参加画面に戻る' : 'ルームから退出'}
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-3xl font-bold text-center">
              みんなでクイズに参加しよう
            </h2>
            <p className="text-white/70 text-center">
              名前を入力してルームを作成するか、招待されたコードで参加してください。
            </p>
            <form onSubmit={join} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">表示名</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={20}
                  required
                  placeholder="例：たろう"
                  autoComplete="nickname"
                />
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={busy || !name.trim()}
                onClick={() => void submit('create')}
              >
                新しいルームを作る
              </Button>
              <div className="border-t border-white/20 pt-5 space-y-2">
                <Label htmlFor="code">ルームコード</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                  maxLength={6}
                  pattern="[A-Fa-f0-9]{6}"
                  required
                  placeholder="6文字のコード"
                  autoCapitalize="characters"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={busy || !name.trim() || !/^[A-F0-9]{6}$/.test(code)}
              >
                {busy ? '接続中…' : 'ルームに参加する'}
              </Button>
            </form>
          </>
        )}
        <div className="border-t border-white/20 pt-4 text-center">
          <Link className="underline text-white/80" href="/demo">
            1問デモを試す
          </Link>
        </div>
      </div>
    </GameLayout>
  );
};
export default Home;
