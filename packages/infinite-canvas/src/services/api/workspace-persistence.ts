import type { Asset } from '@infinite-canvas/stores/use-asset-store';
import { useAssetStore } from '@infinite-canvas/stores/use-asset-store';
import { useCanvasStore, type CanvasProject } from '@infinite-canvas/stores/canvas/use-canvas-store';
import { getImageBlob, uploadImage } from '@infinite-canvas/services/image-storage';
import { getMediaBlob, uploadMediaFile } from '@infinite-canvas/services/file-storage';
import { getWorkspaceOwnerId } from '@infinite-canvas/lib/user-scoped-storage';

type RemoteProject = { project: CanvasProject; version: number; createdAt: string; updatedAt: string };
type RemoteAsset = { asset: Asset; version: number; createdAt: string; updatedAt: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`/api/image-studio${path}`, {
        ...init,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
        cache: 'no-store',
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
        const error = new Error(result?.message || `工作台同步失败（${response.status}）`);
        Object.assign(error, { status: response.status, code: result?.code });
        throw error;
    }
    return result.data as T;
}

async function waitForHydration(store: typeof useCanvasStore | typeof useAssetStore) {
    if (store.persist.hasHydrated()) return;
    await new Promise<void>((resolve) => {
        const unsubscribe = store.persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
        });
        if (store.persist.hasHydrated()) {
            unsubscribe();
            resolve();
        }
    });
}

function errorStatus(error: unknown) {
    return error && typeof error === 'object' && 'status' in error ? Number((error as { status?: unknown }).status) : 0;
}

type LegacyMediaReference = { key: string; kind: 'image' | 'video'; candidates: string[]; localKey?: string; inlineUrl?: string; canonicalKey?: string };
const convertedInlineMedia = new Map<string, { storageKey: string; url: string; mimeType: string }>();

function collectMediaReferences(value: unknown, output: LegacyMediaReference[] = [], inheritedKind?: 'image' | 'video') {
    if (typeof value === 'string') {
        const kind = value.startsWith('data:image/') ? 'image' : value.startsWith('data:video/') ? 'video' : value.startsWith('blob:') ? inheritedKind : undefined;
        if (kind) output.push({ key: value, kind, candidates: [value], inlineUrl: value });
        return output;
    }
    if (!value || typeof value !== 'object') return output;
    if (Array.isArray(value)) {
        value.forEach((item) => collectMediaReferences(item, output, inheritedKind));
        return output;
    }
    const record = value as Record<string, unknown>;
    const mimeType = typeof record.mimeType === 'string' ? record.mimeType : '';
    const ownKind = record.kind === 'image' || record.type === 'image' || mimeType.startsWith('image/') ? 'image'
        : record.kind === 'video' || record.type === 'video' || mimeType.startsWith('video/') ? 'video' : inheritedKind;
    const localStorageKey = typeof record.storageKey === 'string' ? record.storageKey : '';
    const canonicalMatch = /^(image|video):oss:(asset_[a-f0-9]{32})$/i.exec(localStorageKey);
    const studioMatch = /^studio-image-asset:([\w-]{1,64})$/.exec(localStorageKey);
    const fields = ['content', 'dataUrl', 'url', 'coverUrl'];
    if (canonicalMatch) {
        const candidates = fields.flatMap((field) => typeof record[field] === 'string' && /^(blob:|data:image\/|data:video\/)/i.test(record[field] as string) ? [record[field] as string] : []);
        if (candidates.length) output.push({ key: localStorageKey, kind: canonicalMatch[1].toLowerCase() as 'image' | 'video', candidates, canonicalKey: localStorageKey });
    }
    if (studioMatch) {
        const candidates = fields.flatMap((field) => typeof record[field] === 'string' && /^(blob:|data:image\/)/i.test(record[field] as string) ? [record[field] as string] : []);
        if (candidates.length) output.push({ key: localStorageKey, kind: 'image', candidates, canonicalKey: localStorageKey });
    }
    if (localStorageKey) {
        const key = localStorageKey;
        if ((key.startsWith('image:') && !key.startsWith('image:oss:')) || (key.startsWith('video:') && !key.startsWith('video:oss:'))) {
            const kind = key.startsWith('image:') ? 'image' : 'video';
            const candidates = fields.flatMap((field) => typeof record[field] === 'string' ? [record[field] as string] : []);
            output.push({ key, kind, candidates, localKey: key });
        }
    }
    if (!localStorageKey) {
        for (const field of fields) {
            const candidate = record[field];
            if (typeof candidate !== 'string') continue;
            const kind = candidate.startsWith('data:image/') ? 'image' : ownKind;
            if (kind && (candidate.startsWith('data:') || candidate.startsWith('blob:') || /^https?:\/\//i.test(candidate) || candidate.startsWith('/api/upload/'))) {
                output.push({ key: candidate, kind, candidates: [candidate], inlineUrl: candidate });
            }
        }
    }
    Object.entries(record).forEach(([key, item]) => {
        if (fields.includes(key) && typeof item === 'string' && (canonicalMatch || localStorageKey)) return;
        collectMediaReferences(item, output, key === 'images' ? 'image' : key === 'videos' ? 'video' : ownKind);
    });
    return output;
}

export async function uploadLegacyMedia(value: unknown, deps = { getImageBlob, getMediaBlob, uploadImage, uploadMediaFile }) {
    const keyReplacements = new Map<string, { storageKey: string; url: string; mimeType: string }>();
    const urlReplacements = new Map<string, { storageKey: string; url: string; mimeType: string }>();
    const references = collectMediaReferences(value);
    for (const reference of references) {
        if (reference.canonicalKey) {
            const isStudio = reference.canonicalKey.startsWith('studio-image-asset:');
            const id = reference.canonicalKey.split(':')[isStudio ? 1 : 2];
            const replacement = { storageKey: reference.canonicalKey, url: isStudio ? `/api/image-studio/assets/${encodeURIComponent(id)}/preview` : reference.kind === 'image' ? `/api/upload/previews/${encodeURIComponent(id)}` : `/api/upload/videos/${encodeURIComponent(id)}/stream`, mimeType: '' };
            for (const sourceUrl of reference.candidates) urlReplacements.set(sourceUrl, replacement);
            continue;
        }
        const cacheKey = reference.localKey || reference.inlineUrl || reference.key;
        if (urlReplacements.has(cacheKey) || keyReplacements.has(cacheKey)) continue;
        const cached = convertedInlineMedia.get(cacheKey);
        if (cached) {
            if (reference.localKey) keyReplacements.set(reference.localKey, cached);
            for (const sourceUrl of reference.candidates) urlReplacements.set(sourceUrl, cached);
            continue;
        }
        const blob = reference.localKey ? reference.kind === 'image' ? await deps.getImageBlob(reference.localKey) : await deps.getMediaBlob(reference.localKey) : null;
        const candidate = reference.candidates.find((url) => url.startsWith('data:') || url.startsWith('blob:') || /^https?:\/\//i.test(url) || url.startsWith('/api/upload/'));
        if (!blob && !candidate) throw new Error(`找不到旧素材 ${reference.key} 的本地文件，无法迁移到 OSS`);
        const uploaded = reference.kind === 'image'
            ? await deps.uploadImage(blob || candidate!)
            : await deps.uploadMediaFile(blob || candidate!, 'video');
        const replacement = { storageKey: uploaded.storageKey!, url: uploaded.url, mimeType: uploaded.mimeType };
        if (reference.inlineUrl || reference.localKey) {
            if (convertedInlineMedia.size >= 100) convertedInlineMedia.delete(convertedInlineMedia.keys().next().value!);
            convertedInlineMedia.set(cacheKey, replacement);
        }
        if (reference.localKey) keyReplacements.set(reference.localKey, replacement);
        for (const sourceUrl of reference.candidates) urlReplacements.set(sourceUrl, replacement);
    }

    const rewrite = (item: unknown, parentKind?: 'image' | 'video', fieldName?: string): unknown => {
        if (typeof item === 'string') {
            if (keyReplacements.has(item)) return keyReplacements.get(item)!.storageKey;
            if (urlReplacements.has(item)) return fieldName === 'references' ? urlReplacements.get(item)!.storageKey : urlReplacements.get(item)!.url;
            return item;
        }
        if (Array.isArray(item)) return item.map((child) => rewrite(child, parentKind, fieldName));
        if (!item || typeof item !== 'object') return item;
        const source = item as Record<string, unknown>;
        const ownKey = typeof source.storageKey === 'string' ? source.storageKey : '';
        const replacement = keyReplacements.get(ownKey);
        const mimeType = typeof source.mimeType === 'string' ? source.mimeType : '';
        const ownKind = source.kind === 'image' || source.type === 'image' || mimeType.startsWith('image/') || ownKey.startsWith('image:') ? 'image'
            : source.kind === 'video' || source.type === 'video' || mimeType.startsWith('video/') || ownKey.startsWith('video:') ? 'video' : parentKind;
        const next: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(source)) {
            if (key === 'storageKey' && replacement) next[key] = replacement.storageKey;
            else if (['content', 'dataUrl', 'url', 'coverUrl'].includes(key) && typeof child === 'string' && urlReplacements.has(child)) next[key] = urlReplacements.get(child)!.url;
            else next[key] = rewrite(child, ownKind, key);
        }
        if (!ownKey && ownKind && !('storageKey' in next)) {
            const matched = ['content', 'dataUrl', 'url'].map((field) => typeof source[field] === 'string' ? urlReplacements.get(source[field] as string) : undefined).find(Boolean);
            if (matched) { next.storageKey = matched.storageKey; if (source.mimeType === 'image/svg+xml') next.mimeType = matched.mimeType; }
        }
        if (replacement && source.mimeType === 'image/svg+xml') next.mimeType = replacement.mimeType;
        return next;
    };
    const result = keyReplacements.size || urlReplacements.size ? rewrite(value) : value;
    const unresolved = (item: unknown, path = '画布'): string | null => {
        if (typeof item === 'string') return /^(blob:|data:image\/|data:video\/)/i.test(item) ? path : null;
        if (!item || typeof item !== 'object') return null;
        for (const [key, child] of Object.entries(item)) {
            const found = unresolved(child, `${path}.${key}`);
            if (found) return found;
        }
        return null;
    };
    const missing = unresolved(result);
    if (missing) throw new Error(`无法保存临时素材（${missing}），请重新上传该素材后重试。`);
    return result;
}

async function prepareProject(project: CanvasProject) {
    return await uploadLegacyMedia(project) as CanvasProject;
}

async function prepareAsset(asset: Asset) {
    return await uploadLegacyMedia(asset) as Asset;
}

async function loadProjects() {
    return request<RemoteProject[]>('/canvas/projects');
}

async function createProject(project: CanvasProject) {
    return request<RemoteProject>('/canvas/projects', { method: 'POST', body: JSON.stringify({ project }) });
}

async function updateProject(project: CanvasProject, version: number) {
    return request<RemoteProject>(`/canvas/projects/${encodeURIComponent(project.id)}`, {
        method: 'PUT', body: JSON.stringify({ project, version }),
    });
}

async function deleteProject(id: string) {
    return request<{ deleted: boolean }>(`/canvas/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function loadAssets() {
    return request<RemoteAsset[]>('/canvas/assets');
}

async function saveAssets(assets: Asset[], deletedIds: string[]) {
    return request<{ saved: number; deleted: number }>('/canvas/assets', {
        method: 'PUT', body: JSON.stringify({ assets, deletedIds }),
    });
}

let started = false;
let initializing = false;
let initializationPromise: Promise<void> | null = null;
let workspaceOwnerId: string | null = null;
let applyingRemote = false;
let syncRunning = false;
let syncQueued = false;
let projectsQueued = false;
let assetsQueued = false;
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 3_000;
const projectVersions = new Map<string, number>();
let projectWriteQueue: Promise<unknown> = Promise.resolve();

function withProjectWriteLock<T>(operation: () => Promise<T>) {
    const result = projectWriteQueue.then(operation, operation);
    projectWriteQueue = result.then(() => undefined, () => undefined);
    return result;
}

function scheduleSync(target: 'projects' | 'assets' | 'all' = 'all', delay = 900) {
    if (!started || initializing || applyingRemote) return;
    syncQueued = true;
    if (target === 'projects' || target === 'all') projectsQueued = true;
    if (target === 'assets' || target === 'all') assetsQueued = true;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void flushSync(), delay);
}

async function saveOneProject(project: CanvasProject) {
    const prepared = await prepareProject(project);
    let version = projectVersions.get(prepared.id);
    if (version === undefined) {
        const existing = (await loadProjects()).find((item) => item.project.id === prepared.id);
        if (existing) {
            version = existing.version;
            projectVersions.set(prepared.id, version);
        }
    }
    try {
        const saved = version === undefined ? await createProject(prepared) : await updateProject(prepared, version);
        projectVersions.set(prepared.id, saved.version);
        return prepared;
    } catch (error) {
        if (errorStatus(error) !== 409 || (error as { code?: string }).code !== 'IMAGE_STUDIO_CANVAS_VERSION_CONFLICT') throw error;
        const latest = (await loadProjects()).find((item) => item.project.id === prepared.id);
        if (!latest) {
            const saved = await createProject(prepared);
            projectVersions.set(prepared.id, saved.version);
            return prepared;
        }
        const saved = await updateProject(prepared, latest.version);
        projectVersions.set(prepared.id, saved.version);
        return prepared;
    }
}

async function flushSync() {
    if (syncRunning || initializing || !started) return;
    syncRunning = true;
    try {
        while (syncQueued) {
            syncQueued = false;
            const saveProjects = projectsQueued;
            const saveAssetsQueued = assetsQueued;
            projectsQueued = false;
            assetsQueued = false;
            if (saveProjects) {
                await withProjectWriteLock(async () => {
                    const canvasState = useCanvasStore.getState();
                    const preparedProjects = await Promise.all(canvasState.projects.map(saveOneProject));
                    const deletedProjects = canvasState.deletedProjects;
                    if (preparedProjects.some((project, index) => project !== canvasState.projects[index])) {
                        applyingRemote = true;
                        const current = useCanvasStore.getState();
                        const originals = new Map(canvasState.projects.map((project) => [project.id, project]));
                        const preparedById = new Map(preparedProjects.map((project) => [project.id, project]));
                        useCanvasStore.getState().replaceProjects(current.projects.map((project) => project === originals.get(project.id) ? preparedById.get(project.id) || project : project), current.deletedProjects);
                        applyingRemote = false;
                    }
                    for (const deleted of deletedProjects) {
                        try { await deleteProject(deleted.id); } catch (error) { if (errorStatus(error) !== 404) throw error; }
                        projectVersions.delete(deleted.id);
                    }
                    if (deletedProjects.length) {
                        applyingRemote = true;
                        const current = useCanvasStore.getState();
                        const deletedIds = new Set(deletedProjects.map((item) => item.id));
                        current.replaceProjects(current.projects, current.deletedProjects.filter((item) => !deletedIds.has(item.id)));
                        applyingRemote = false;
                    }
                });
            }

            if (saveAssetsQueued) {
                const assetState = useAssetStore.getState();
                const preparedAssets = await Promise.all(assetState.assets.map(prepareAsset));
                await saveAssets(preparedAssets, assetState.deletedAssetIds || []);
                if (assetState.deletedAssetIds?.length || preparedAssets.some((asset, index) => asset !== assetState.assets[index])) {
                    applyingRemote = true;
                    const current = useAssetStore.getState();
                    const originals = new Map(assetState.assets.map((asset) => [asset.id, asset]));
                    const preparedById = new Map(preparedAssets.map((asset) => [asset.id, asset]));
                    const deleted = new Set(assetState.deletedAssetIds || []);
                    current.replaceAssets(current.assets.map((asset) => asset === originals.get(asset.id) ? preparedById.get(asset.id) || asset : asset), (current.deletedAssetIds || []).filter((id) => !deleted.has(id)));
                    applyingRemote = false;
                }
            }
        }
        retryDelay = 3_000;
    } catch (error) {
        console.warn('[Infinite Canvas] 云端保存暂不可用，稍后会自动重试。', error);
        syncQueued = true;
        projectsQueued = true;
        assetsQueued = true;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => void flushSync(), retryDelay);
        retryDelay = Math.min(60_000, retryDelay * 2);
    } finally {
        syncRunning = false;
    }
}

async function initializeFromServer() {
    initializing = true;
    try {
        const [remoteProjects, remoteAssets] = await Promise.all([loadProjects(), loadAssets()]);
        const localProjects = useCanvasStore.getState().projects;
        const deletedProjectIds = new Set(useCanvasStore.getState().deletedProjects.map((item) => item.id));
        const activeRemoteProjects = remoteProjects.filter((item) => !deletedProjectIds.has(item.project.id));
        const mergedProjects = new Map(activeRemoteProjects.map((item) => [item.project.id, item.project]));
        const localProjectVersions = new Map(activeRemoteProjects.map((item) => [item.project.id, item.version]));
        for (const local of localProjects) {
            const remote = activeRemoteProjects.find((item) => item.project.id === local.id);
            if (!remote || new Date(local.updatedAt).getTime() >= new Date(remote.updatedAt).getTime()) {
                const prepared = await prepareProject(local);
                const saved = remote ? await updateProject(prepared, remote.version) : await createProject(prepared);
                mergedProjects.set(prepared.id, prepared);
                localProjectVersions.set(prepared.id, saved.version);
            } else {
                mergedProjects.set(remote.project.id, remote.project);
            }
        }
        projectVersions.clear();
        localProjectVersions.forEach((version, id) => projectVersions.set(id, version));

        const assetState = useAssetStore.getState();
        const localAssets = assetState.assets;
        const deletedAssetIds = new Set(assetState.deletedAssetIds || []);
        const mergedAssets = new Map(remoteAssets.filter((item) => !deletedAssetIds.has(item.asset.id)).map((item) => [item.asset.id, item.asset]));
        for (const local of localAssets) {
            const remote = remoteAssets.find((item) => item.asset.id === local.id);
            if (!remote || new Date(local.updatedAt).getTime() >= new Date(remote.updatedAt).getTime()) {
                const prepared = await prepareAsset(local);
                mergedAssets.set(prepared.id, prepared);
            }
        }

        applyingRemote = true;
        const projects = [...mergedProjects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        useCanvasStore.getState().replaceProjects(projects, useCanvasStore.getState().deletedProjects);
        useAssetStore.getState().replaceAssets([...mergedAssets.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), assetState.deletedAssetIds || []);
        applyingRemote = false;
        initializing = false;
        started = true;
        scheduleSync('all', 100);
    } catch (error) {
        applyingRemote = false;
        initializing = false;
        started = true;
        console.warn('[Infinite Canvas] 云端数据加载失败，暂时保留本地数据并自动重试。', error);
        scheduleSync('all', retryDelay);
        retryDelay = Math.min(60_000, retryDelay * 2);
    } finally {
        initializing = false;
    }
}

export function startWorkspacePersistence() {
    const currentOwnerId = getWorkspaceOwnerId();
    if (!currentOwnerId) return;
    if (workspaceOwnerId && workspaceOwnerId !== currentOwnerId) {
        window.location.reload();
        return;
    }
    if (started || initializing) return;
    workspaceOwnerId = currentOwnerId;
    initializing = true;
    initializationPromise = Promise.all([waitForHydration(useCanvasStore), waitForHydration(useAssetStore)]).then(() => {
        initializing = false;
        return initializeFromServer();
    }).catch((error) => {
        initializing = false;
        console.warn('[Infinite Canvas] 本地数据初始化失败。', error);
    });
    useCanvasStore.subscribe(() => scheduleSync('projects'));
    useAssetStore.subscribe(() => scheduleSync('assets'));
}

export async function ensureWorkspacePersistenceReady() {
    const currentOwnerId = getWorkspaceOwnerId();
    if (!currentOwnerId) throw new Error('请先登录客服账号，再保存画布项目');
    if (workspaceOwnerId && workspaceOwnerId !== currentOwnerId) throw new Error('登录账号已切换，请刷新工作台后重试');
    if (!started && !initializing) startWorkspacePersistence();
    if (initializationPromise) await initializationPromise;
    if (!started || workspaceOwnerId !== currentOwnerId) throw new Error('工作台数据库尚未连接，请稍后重试');
}

function replaceProjectInStore(project: CanvasProject, remove = false) {
    const store = useCanvasStore.getState();
    const projects = remove
        ? store.projects.filter((item) => item.id !== project.id)
        : store.projects.some((item) => item.id === project.id)
            ? store.projects.map((item) => item.id === project.id ? project : item)
            : [project, ...store.projects];
    const deletedProjects = store.deletedProjects.filter((item) => item.id !== project.id);
    applyingRemote = true;
    try {
        useCanvasStore.getState().replaceProjects(projects, deletedProjects);
    } finally {
        applyingRemote = false;
    }
}

export async function createWorkspaceCanvasProject(title?: string, projectId?: string) {
    await ensureWorkspacePersistenceReady();
    return withProjectWriteLock(async () => {
        if (projectId) {
            if (!/^[\w-]{1,64}$/.test(projectId)) throw new Error("画布项目 ID 无效");
            const local = useCanvasStore.getState().projects.find((item) => item.id === projectId);
            if (local) return local.id;
            const remote = (await loadProjects()).find((item) => item.project.id === projectId);
            if (remote) {
                projectVersions.set(projectId, remote.version);
                replaceProjectInStore(remote.project);
                return projectId;
            }
        }
        applyingRemote = true;
        let id = '';
        try { id = useCanvasStore.getState().createProject(title, projectId); }
        finally { applyingRemote = false; }
        const project = useCanvasStore.getState().projects.find((item) => item.id === id);
        if (!project) throw new Error('无法创建画布项目');
        try {
            const prepared = await prepareProject(project);
            const saved = await createProject(prepared);
            if (!saved) throw new Error('服务端未返回新建画布项目');
            projectVersions.set(id, saved.version);
            replaceProjectInStore(prepared);
            return id;
        } catch (error) {
            replaceProjectInStore(project, true);
            throw error;
        }
    });
}

export async function importWorkspaceCanvasProject(source: Partial<CanvasProject>) {
    await ensureWorkspacePersistenceReady();
    return withProjectWriteLock(async () => {
        applyingRemote = true;
        let id = '';
        try { id = useCanvasStore.getState().importProject(source); }
        finally { applyingRemote = false; }
        const project = useCanvasStore.getState().projects.find((item) => item.id === id);
        if (!project) throw new Error('无法读取导入的画布项目');
        try {
            const prepared = await saveOneProject(project);
            replaceProjectInStore(prepared);
            return id;
        } catch (error) {
            replaceProjectInStore(project, true);
            throw error;
        }
    });
}

export async function renameWorkspaceCanvasProject(projectId: string, title: string) {
    await ensureWorkspacePersistenceReady();
    return withProjectWriteLock(async () => {
        const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
        if (!project) throw new Error('画布项目不存在或已被删除');
        const next = { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() };
        const prepared = await saveOneProject(next);
        replaceProjectInStore(prepared);
        return prepared;
    });
}

export async function deleteWorkspaceCanvasProjects(projectIds: string[]) {
    await ensureWorkspacePersistenceReady();
    return withProjectWriteLock(async () => {
        const projects = useCanvasStore.getState().projects.filter((item) => projectIds.includes(item.id));
        for (const project of projects) {
            try { await deleteProject(project.id); }
            catch (error) { if (errorStatus(error) !== 404) throw error; }
            projectVersions.delete(project.id);
        }
        const removeIds = new Set(projectIds);
        const store = useCanvasStore.getState();
        applyingRemote = true;
        try {
            useCanvasStore.getState().replaceProjects(store.projects.filter((item) => !removeIds.has(item.id)), store.deletedProjects.filter((item) => !removeIds.has(item.id)));
        } finally {
            applyingRemote = false;
        }
        return projects.length;
    });
}

export function handleWorkspaceAuthChange() {
    if (workspaceOwnerId && getWorkspaceOwnerId() !== workspaceOwnerId) {
        if (syncTimer) clearTimeout(syncTimer);
        window.location.reload();
        return;
    }
    startWorkspacePersistence();
}
