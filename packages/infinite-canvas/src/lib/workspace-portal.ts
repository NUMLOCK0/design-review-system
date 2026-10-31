export function getWorkspacePortalRoot(): HTMLElement {
    return document.querySelector<HTMLElement>(".infinite-canvas-root") || document.body;
}
