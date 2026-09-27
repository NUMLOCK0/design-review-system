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
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-28 pt-4 sm:p-6 md:pb-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
