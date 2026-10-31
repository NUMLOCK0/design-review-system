"use client";

import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams as useNextSearchParams } from "next/navigation";
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { useCallback, useSyncExternalStore } from "react";

export const WORKSPACE_BASE_PATH = "/service/image-studio/workspace";

function getWorkspacePath(pathname: string | null | undefined) {
    if (!pathname || pathname === WORKSPACE_BASE_PATH) return "/";
    if (pathname.startsWith(`${WORKSPACE_BASE_PATH}/`)) return pathname.slice(WORKSPACE_BASE_PATH.length) || "/";
    return pathname;
}

function getWorkspaceHref(to: string) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(to)) return to;
    if (to === WORKSPACE_BASE_PATH || to.startsWith(`${WORKSPACE_BASE_PATH}/`)) return to;
    const normalized = to.startsWith("/") ? to : `/${to}`;
    return normalized === "/" ? WORKSPACE_BASE_PATH : `${WORKSPACE_BASE_PATH}${normalized}`;
}

export function useNavigate() {
    const router = useRouter();
    return useCallback((to: string | number, options?: { replace?: boolean }) => {
        if (typeof to === "number") {
            if (to < 0) router.back();
            else router.forward();
            return;
        }
        const href = getWorkspaceHref(to);
        if (options?.replace) router.replace(href);
        else router.push(href);
    }, [router]);
}

export function useLocation() {
    const pathname = usePathname();
    const searchParams = useNextSearchParams();
    const hash = useSyncExternalStore(
        (onChange) => {
            window.addEventListener("hashchange", onChange);
            window.addEventListener("popstate", onChange);
            return () => {
                window.removeEventListener("hashchange", onChange);
                window.removeEventListener("popstate", onChange);
            };
        },
        () => window.location.hash,
        () => "",
    );
    return {
        pathname: getWorkspacePath(pathname),
        search: searchParams.size ? `?${searchParams.toString()}` : "",
        hash,
    };
}

export function useParams<T extends Record<string, string | undefined> = { id?: string }>(): T {
    const pathname = getWorkspacePath(usePathname());
    const canvasProjectMatch = pathname.match(/^\/canvas\/([^/]+)\/?$/);
    return (canvasProjectMatch ? { id: decodeURIComponent(canvasProjectMatch[1]) } : {}) as T;
}

export function useSearchParams(): [URLSearchParams] {
    const searchParams = useNextSearchParams();
    return [new URLSearchParams(searchParams.toString())];
}

type LinkProps = PropsWithChildren<Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string }>;

export function Link({ to, children, ...props }: LinkProps) {
    return <NextLink href={getWorkspaceHref(to)} {...props}>{children}</NextLink>;
}

export type NavigateFunction = ReturnType<typeof useNavigate>;

