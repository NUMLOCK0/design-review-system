import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { RoleTheme } from "@/components/layout/role-theme";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F1F5F9]">
      <RoleTheme />
      <AdminSidebar />
      <main className="ml-72 flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
