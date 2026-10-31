"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";

import "@infinite-canvas/i18n";
import { AppProviders } from "@infinite-canvas/components/layout/app-providers";
import { AnalyticsTracker } from "@infinite-canvas/components/layout/analytics-tracker";
import UserLayout from "@infinite-canvas/layouts/user-layout";
import AssetsPage from "@infinite-canvas/pages/assets";
import CanvasPage from "@infinite-canvas/pages/canvas";
import CanvasProjectPage from "@infinite-canvas/pages/canvas/project";
import ConfigPage from "@infinite-canvas/pages/config";
import HomePage from "@infinite-canvas/pages/home";
import ImagePage from "@infinite-canvas/pages/image";
import NotFound from "@infinite-canvas/pages/not-found";
import PromptsPage from "@infinite-canvas/pages/prompts";
import VideoPage from "@infinite-canvas/pages/video";
import { WORKSPACE_BASE_PATH } from "@infinite-canvas/lib/next-router";

function WorkspaceRoute() {
    const pathname = usePathname() || WORKSPACE_BASE_PATH;
    const routePath = pathname === WORKSPACE_BASE_PATH ? "/" : pathname.slice(WORKSPACE_BASE_PATH.length) || "/";

    if (routePath === "/" || routePath === "") return <HomePage />;
    if (routePath === "/image") return <ImagePage />;
    if (routePath === "/video") return <VideoPage />;
    if (routePath === "/assets") return <AssetsPage />;
    if (routePath === "/prompts") return <PromptsPage />;
    if (routePath === "/canvas") return <CanvasPage />;
    if (routePath === "/config") return <ConfigPage />;
    if (/^\/canvas\/[^/]+\/?$/.test(routePath)) return <CanvasProjectPage />;
    return <NotFound />;
}

export function ImageStudioCanvasContent({ projectId, onReady }: { projectId: string; onReady?: () => void }) {
    return <CanvasProjectPage projectId={projectId} workbenchMode onReady={onReady} />;
}

export default function InfiniteCanvasIntegratedApp() {
    return (
        <div className="infinite-canvas-root">
            <AppProviders>
                <UserLayout>
                    <AnalyticsTracker />
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-stone-500">正在载入工作台…</div>}>
                        <WorkspaceRoute />
                    </Suspense>
                </UserLayout>
            </AppProviders>
        </div>
    );
}

