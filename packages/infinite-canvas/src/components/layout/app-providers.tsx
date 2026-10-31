import type { ReactNode } from "react";
import { useEffect } from "react";
import { ProConfigProvider } from "@ant-design/pro-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "@infinite-canvas/lib/antd";
import enUS from "antd/es/locale/en_US";
import zhCN from "antd/es/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useTranslation } from "react-i18next";

import { ClientRootInit } from "@infinite-canvas/components/layout/client-root-init";
import type { AppLocale } from "@infinite-canvas/i18n";
import { getAntThemeConfig } from "@infinite-canvas/lib/app-theme";
import { useThemeStore } from "@infinite-canvas/stores/use-theme-store";
import { handleWorkspaceAuthChange, startWorkspacePersistence } from "@infinite-canvas/services/api/workspace-persistence";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});

export function AppProviders({ children, className }: { children: ReactNode; className?: string }) {
    const { i18n } = useTranslation();
    const theme = useThemeStore((state) => state.theme);
    const dark = theme === "dark";
    const locale = i18n.resolvedLanguage as AppLocale;

    useEffect(() => {
        const workspaceRoot = document.querySelector<HTMLElement>(".infinite-canvas-root");
        if (!workspaceRoot) return;
        workspaceRoot.classList.toggle("dark", dark);
        workspaceRoot.style.colorScheme = theme;
    }, [dark, theme]);

    useEffect(() => {
        dayjs.locale(locale === "zh-CN" ? "zh-cn" : "en");
    }, [locale]);

    useEffect(() => {
        startWorkspacePersistence();
        window.addEventListener("auth-state-change", handleWorkspaceAuthChange);
        return () => window.removeEventListener("auth-state-change", handleWorkspaceAuthChange);
    }, []);

    const getPopupContainer = () => document.querySelector<HTMLElement>(".infinite-canvas-root") ?? document.body;

    return (
        <ConfigProvider locale={locale === "zh-CN" ? zhCN : enUS} theme={getAntThemeConfig(dark)} getPopupContainer={getPopupContainer}>
            <ProConfigProvider dark={dark}>
                <App className={className}>
                    <QueryClientProvider client={queryClient}>
                        <ClientRootInit>{children}</ClientRootInit>
                    </QueryClientProvider>
                </App>
            </ProConfigProvider>
        </ConfigProvider>
    );
}
