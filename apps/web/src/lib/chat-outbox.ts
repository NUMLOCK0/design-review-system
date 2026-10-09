export type PendingChatMessage = {
  userId: string;
  orderId: string;
  clientMessageId: string;
  body: string;
  createdAt: string;
};

const DB_NAME = 'design-review-chat';
const STORE = 'outbox';

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'clientMessageId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('待发消息存储不可用'));
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void): Promise<T> {
  const db = await openOutbox();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let value: T;
    transaction.oncomplete = () => { db.close(); resolve(value); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('待发消息存储失败')); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error('待发消息存储已中断')); };
    run(transaction.objectStore(STORE), (result) => { value = result; }, reject);
  });
}

export function savePendingMessage(message: PendingChatMessage) {
  return transact<void>('readwrite', (store) => { store.put(message); });
}

export function removePendingMessages(ids: string[]) {
  return transact<void>('readwrite', (store) => { for (const id of ids) store.delete(id); });
}

export function loadPendingMessages(userId: string, orderId: string) {
  return transact<PendingChatMessage[]>('readonly', (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as PendingChatMessage[]).filter((item) => item.userId === userId && item.orderId === orderId));
    request.onerror = () => reject(request.error || new Error('待发消息读取失败'));
  });
}
