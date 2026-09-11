'use client';

import { useEffect, useState, type FC, type FormEvent } from 'react';
import Link from 'next/link';
import { GameLayout } from '@/components/layout/GameLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RoomView } from '@/types/room';

const Home: FC = () => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [activeCode, setActiveCode] = useState('');
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const initial =
      new URLSearchParams(window.location.search).get('room') || '';
    setCode(initial.toUpperCase());
    setActiveCode(initial.toUpperCase());
  }, []);

  useEffect(() => {
    if (!activeCode) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/rooms?code=${encodeURIComponent(activeCode)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        const data = await response.json().catch(() => {
          throw new Error(
            '接続できません。しばらく待ってからもう一度お試しください。'
          );
        });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (response.status === 403 || response.status === 404) {
            setView(null);
            setActiveCode('');
            if (response.status === 404) setError(data.error);
            return;
          }
          throw new Error(data.error);
        }
        setView(data);
        setError('');
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : '接続を再試行しています。'
          );
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => void refresh(), 2000);
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeCode]);

  const submit = async (action: 'create' | 'join' | 'leave') => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name, code: view?.room.code || code }),
      });
      const data = await response.json().catch(() => {
        throw new Error(
          '接続できません。しばらく待ってからもう一度お試しください。'
        );
      });
      if (!response.ok) throw new Error(data.error);
      if (action === 'leave') {
        setActiveCode('');
        setView(null);
        window.history.replaceState(null, '', '/');
      } else {
        setView(data);
        setActiveCode(data.room.code);
        window.history.replaceState(null, '', `/?room=${data.room.code}`);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '接続できませんでした。もう一度お試しください。'
      );
    } finally {
      setBusy(false);
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
        {view ? (
          <>
            <div className="text-center space-y-3">
              <p className="text-white/70">参加者を募集中</p>
              <h2 className="text-2xl font-bold">クイズの待合室</h2>
              <p>ルームコード</p>
              <p className="text-4xl font-mono tracking-widest font-bold">
                {view.room.code}
              </p>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
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
              参加者 {view.room.players.length} / 20人
            </h3>
            <ul className="space-y-2" aria-label="参加者一覧">
              {view.room.players.map((player) => (
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
              参加者一覧は自動で更新されます。現在は参加受付まで利用できます。対戦・出題機能は準備中です。
            </p>
            <Button
              disabled={busy}
              onClick={() => void submit('leave')}
              variant="destructive"
            >
              ルームから退出
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
