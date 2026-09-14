'use client';
import { useEffect, useState, type FC } from 'react';
import Link from 'next/link';
import { useMonitorConnection } from '@/hooks/use-game-connection';
import { MonitorView } from '@/components/game/MonitorView';
import { Button } from '@/components/ui/button';
const MonitorPage: FC = () => {
  const [code, setCode] = useState('');
  const { state, status, message, retry, clock } = useMonitorConnection(code);
  useEffect(() => {
    const value =
      new URLSearchParams(window.location.search).get('room')?.toUpperCase() ||
      '';
    if (/^[A-F0-9]{6}$/.test(value)) setCode(value);
  }, []);
  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-950 to-blue-950 text-white p-6 lg:p-12">
      <div className="max-w-[1800px] mx-auto space-y-8">
        {status !== 'connected' && (
          <div role="status" className="rounded-lg bg-white/10 p-5 text-xl">
            {!code
              ? 'ホストの待合室からモニターを開いてください。'
              : message || '接続しています…'}
            {status === 'failed' && (
              <Button className="ml-4" onClick={retry}>
                再接続する
              </Button>
            )}
          </div>
        )}
        {state && <MonitorView state={state} clock={clock} />}
        <Link
          href={code ? `/?room=${code}` : '/'}
          className="underline text-white/70"
        >
          参加者の画面に戻る
        </Link>
      </div>
    </main>
  );
};
export default MonitorPage;
