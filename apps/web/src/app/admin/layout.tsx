import { notFound, redirect } from 'next/navigation';
import { AdminWorkspace } from '@/components/layout/admin-workspace';
import { getServerSessionClaims } from '@/lib/server-auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSessionClaims();
  if (!session) redirect('/login/staff?redirect=%2Fadmin');
  if (session.role !== 'admin') notFound();

  return <AdminWorkspace>{children}</AdminWorkspace>;
}
