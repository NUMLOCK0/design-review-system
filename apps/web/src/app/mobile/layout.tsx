import { RoleTheme } from '@/components/layout/role-theme';
import { MobileAppShell } from '@/components/mobile/mobile-app-shell';

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[#f4f6f8] text-slate-900">
    <RoleTheme />
    <MobileAppShell>{children}</MobileAppShell>
  </div>;
}
