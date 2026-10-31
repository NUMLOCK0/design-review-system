import type { CanvasConnection, CanvasNodeData } from "@infinite-canvas/types/canvas";

export type WorkbenchCanvasCommand =
    | { type: "upsert-nodes"; projectId: string; nodes: CanvasNodeData[]; connections?: CanvasConnection[]; selectLast?: boolean }
    | { type: "focus-node"; projectId: string; nodeId: string };

type Listener = (command: WorkbenchCanvasCommand) => void;
const listeners = new Set<Listener>();

export function subscribeWorkbenchCanvas(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function publishWorkbenchCanvasCommand(command: WorkbenchCanvasCommand) {
    listeners.forEach((listener) => listener(command));
}

type Selection = { projectId: string; nodeIds: string[] };
const selectionListeners = new Set<(selection: Selection) => void>();
export function subscribeWorkbenchSelection(listener: (selection: Selection) => void) {
    selectionListeners.add(listener);
    return () => { selectionListeners.delete(listener); };
}
export function publishWorkbenchSelection(selection: Selection) {
    selectionListeners.forEach((listener) => listener(selection));
}
