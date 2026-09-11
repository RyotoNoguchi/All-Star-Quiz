'use client';
import { useEffect, useState, type FC } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, apiErrorStatus } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
type Props = { email: string };
export const AdminDashboard: FC<Props> = ({ email }) => {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      try {
        await api.admin.me.query(undefined, { signal: controller.signal });
      } catch (cause) {
        if (!controller.signal.aborted && apiErrorStatus(cause) === 401)
          router.replace('/admin/login');
      }
    };
    const timer = setInterval(() => void check(), 30000);
    window.addEventListener('focus', check);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [router]);
  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h2 className="text-2xl font-bold">管理者メニュー</h2>
      <p>{email} でログイン中</p>
      <p>問題の編集画面は準備中です。</p>
      {error && <p role="alert">{error}</p>}
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await api.admin.logout.mutate();
            router.replace('/admin/login');
            router.refresh();
          } catch {
            setError('ログアウトできませんでした。もう一度お試しください。');
            setBusy(false);
          }
        }}
      >
        ログアウト
      </Button>
      <p>
        <Link href="/" className="underline">
          参加画面に戻る
        </Link>
      </p>
    </div>
  );
};
