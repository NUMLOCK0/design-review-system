const storageKey = (userId: string) => `service-collaboration:selected:${userId}`;

export function getSelectedServiceChat(userId: string): string | null {
  try { const selected = localStorage.getItem(storageKey(userId)); return selected?.startsWith('intake:') ? null : selected; }
  catch { return null; }
}

export function getSelectedServiceIntake(userId: string): string | null {
  try { const selected = localStorage.getItem(storageKey(userId)); return selected?.startsWith('intake:') ? selected.slice(7) : null; }
  catch { return null; }
}

export function setSelectedServiceIntake(userId: string, sessionId: string): void {
  try { localStorage.setItem(storageKey(userId), `intake:${sessionId}`); }
  catch { /* The chat remains usable when browser storage is disabled. */ }
}

export function setSelectedServiceChat(userId: string, orderId: string): void {
  try { localStorage.setItem(storageKey(userId), orderId); }
  catch { /* The chat remains usable when browser storage is disabled. */ }
}

export function clearSelectedServiceChat(userId: string): void {
  try { localStorage.removeItem(storageKey(userId)); }
  catch { /* The next visit can still choose the first available conversation. */ }
}
