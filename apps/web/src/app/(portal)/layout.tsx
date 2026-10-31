'use client';

import { usePathname } from 'next/navigation';
import { PortalNavbar } from "@/components/layout/portal-navbar";
import { RoleTheme } from "@/components/layout/role-theme";
import { CustomerServiceLauncher } from "@/components/customer-service-launcher";
import { PortalMain } from "@/components/layout/portal-main";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isCanvasWorkspace = pathname.startsWith('/service/image-studio/workspace') || /^\/service\/image-studio\/[\w-]+$/.test(pathname);

  return (
    <div className={isCanvasWorkspace ? 'flex h-dvh min-h-0 flex-col overflow-hidden bg-[#F8FAFC]' : 'min-h-screen bg-[#F8FAFC] flex flex-col'}>
      <RoleTheme />
      {!isCanvasWorkspace && <PortalNavbar />}
      <PortalMain>
        {children}
      </PortalMain>
      {!isCanvasWorkspace && <CustomerServiceLauncher placement="desktop" />}
    </div>
  );
}
