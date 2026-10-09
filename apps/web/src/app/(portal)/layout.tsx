import { PortalNavbar } from "@/components/layout/portal-navbar";
import { RoleTheme } from "@/components/layout/role-theme";
import { CustomerServiceLauncher } from "@/components/customer-service-launcher";
import { PortalMain } from "@/components/layout/portal-main";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <RoleTheme />
      <PortalNavbar />
      <PortalMain>
        {children}
      </PortalMain>
      <CustomerServiceLauncher placement="desktop" />
    </div>
  );
}
