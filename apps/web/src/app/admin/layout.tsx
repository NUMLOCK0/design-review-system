import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { RoleTheme } from "@/components/layout/role-theme";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F1F5F9] md:flex md:h-screen md:overflow-hidden">
      <RoleTheme />
      <AdminSidebar />
      <main className="min-w-0 flex-1 pb-6 md:ml-72 md:overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
