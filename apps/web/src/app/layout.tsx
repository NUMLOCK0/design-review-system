import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ToastProvider } from "@/components/ui/app-toast";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cozi Design Review | 电商设计稿审核管理系统",
  description: "企业级电商视觉设计审核、在线批注与规则协同平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased min-h-screen">
        <ToastProvider>{children}</ToastProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
