'use client';
import { useState, type FC, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { GameLayout } from '@/components/layout/GameLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
const AdminLogin: FC = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.admin.login.mutate({ email: email.trim(), password });
      setPassword('');
      router.replace('/admin');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'ログインできませんでした。'
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <GameLayout title="管理者ログイン">
      <form onSubmit={submit} className="max-w-md mx-auto space-y-5">
        <h2 className="text-2xl font-bold">クイズの管理</h2>
        {error && (
          <p role="alert" className="bg-red-950 p-3 rounded">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">パスワード</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? 'ログイン中…' : 'ログイン'}
        </Button>
        <p>
          <Link href="/" className="underline">
            参加画面に戻る
          </Link>
        </p>
      </form>
    </GameLayout>
  );
};
export default AdminLogin;
