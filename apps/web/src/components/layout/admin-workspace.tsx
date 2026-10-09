'use client';

import { usePathname } from 'next/navigation';
import { AdminSidebar } from './admin-sidebar';
import { RoleTheme } from './role-theme';
import { CustomerServiceLauncher } from '@/components/customer-service-launcher';

export function AdminWorkspace({ children }: { children: React.ReactNode }) {
  const isFormDesigner = usePathname() === '/admin/settings/forms';

  return <div className="min-h-screen bg-[#F1F5F9] md:flex md:h-screen md:overflow-hidden">
    <RoleTheme />
    {!isFormDesigner && <AdminSidebar />}
    <main className={`min-w-0 flex-1 pb-6 md:overflow-y-auto ${isFormDesigner ? 'w-full' : 'md:ml-72'}`}>{children}</main>
    {!isFormDesigner && <CustomerServiceLauncher placement="desktop" />}
  </div>;
}
