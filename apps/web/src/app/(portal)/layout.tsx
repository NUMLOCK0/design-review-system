import { PortalNavbar } from "@/components/layout/portal-navbar";
import { RoleTheme } from "@/components/layout/role-theme";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <RoleTheme />
      <PortalNavbar />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
