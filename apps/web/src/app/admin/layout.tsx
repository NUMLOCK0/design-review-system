import { notFound, redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { RoleTheme } from '@/components/layout/role-theme';
import { getServerSessionClaims } from '@/lib/server-auth';
import { CustomerServiceLauncher } from '@/components/customer-service-launcher';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSessionClaims();
  if (!session) redirect('/login/staff?redirect=%2Fadmin');
  if (session.role !== 'admin') notFound();

  return <div className="min-h-screen bg-[#F1F5F9] md:flex md:h-screen md:overflow-hidden">
    <RoleTheme />
    <AdminSidebar />
    <main className="min-w-0 flex-1 pb-6 md:ml-72 md:overflow-y-auto">{children}</main>
    <CustomerServiceLauncher placement="desktop" />
  </div>;
}
