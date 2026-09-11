import type { FC } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, readAdminSession } from '@/lib/server/admin';
import { GameLayout } from '@/components/layout/GameLayout';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
const AdminPage: FC = async () => {
  const admin = await readAdminSession(
    (await cookies()).get(ADMIN_COOKIE)?.value || ''
  );
  if (!admin) redirect('/admin/login');
  return (
    <GameLayout title="クイズ管理">
      <AdminDashboard email={admin.email} />
    </GameLayout>
  );
};
export default AdminPage;
