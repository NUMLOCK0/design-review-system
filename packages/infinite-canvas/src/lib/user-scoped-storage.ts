import { localForageStorage } from '@infinite-canvas/lib/localforage-storage';

export function getWorkspaceOwnerId() {
    if (typeof window === 'undefined') return null;
    try {
        const user = JSON.parse(window.localStorage.getItem('auth_user') || 'null') as { id?: unknown; role?: unknown } | null;
        return user?.role === 'customer_service' && typeof user.id === 'string' ? user.id : null;
    } catch {
        return null;
    }
}

/** Keep browser caches isolated between staff accounts; move the pre-cloud cache to the first signed-in owner. */
export async function userScopedStorageName(name: string) {
    const userId = getWorkspaceOwnerId();
    if (!userId) return name;
    const scopedName = `${name}:user:${encodeURIComponent(userId)}`;
    if (await localForageStorage.getItem(scopedName) !== null) return scopedName;
    const legacy = await localForageStorage.getItem(name);
    if (legacy !== null) {
        await localForageStorage.setItem(scopedName, legacy);
        await localForageStorage.removeItem(name);
    }
    return scopedName;
}
