import type { CollaborationForm, CollaborationOrderSummary, CollaborationWorkspace, DesignOrder, FormAnswers, FormTemplate, ImageGroupType, RequirementCandidate, ReviewRule, SiteMessage, SiteMessageType, TaskStatus } from '@design-review/shared';

export interface MiniUser { id: string; name: string; role: string; email: string; avatarUrl?: string }
export interface Session { token: string; user: MiniUser }
export type WechatMiniLoginResult = { status: 'logged_in'; token: string; user: MiniUser } | { status: 'bind_required'; bindTicket: string; expiresInSeconds: number };
export interface ChatMessage { id: string; orderId: string; seq: number; senderId: string; senderName: string; body: string; clientMessageId: string; createdAt: string }
export interface DeliverableImage { taskId: string; taskNo: string; taskStatus: string; productName: string; imageId: string; groupId: string; groupType: string; imageIndex: number; imageUrl: string; thumbnailUrl: string; version: number; submittedAt: string }
export interface IntakeSession { id: string; title: string; creatorId: string; creatorName: string; guestId: string | null; guestName: string | null; status: string; lastSeq: number; updatedAt: string; customerServiceOnline?: boolean }
export interface IntakeMessage { id: string; sessionId: string; seq: number; senderId: string; senderName: string; clientMessageId: string; body: string; createdAt: string }
export interface ChatUnreadSummary { unreadCount: number; conversations: Array<{ kind: 'order' | 'intake'; conversationId: string; unreadCount: number }> }
export interface OrderPricing { imageUnitPrice: number; imageUnitPrices: Partial<Record<ImageGroupType, number>>; minOrderBudget: number; psdSurchargeRate: number }
export interface OrderProgress { task: null | { status: TaskStatus; currentLevel: number; totalImages: number; approvedCount: number; rejectedCount: number; designerName: string }; nodes: Array<{ level: number; reviewerNames: string[]; approvalMode: 'any' | 'all' }> }
const SESSION_KEY = 'cozi-brand-session-v1';
export const API_BASE = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api').replace(/\/+$/, '');
export const getSession = (): Session | null => uni.getStorageSync(SESSION_KEY) || null;
export function saveSession(session: Session) { const previous = getSession(); uni.setStorageSync(SESSION_KEY, session); redirecting = false; if (previous?.token !== session.token || previous?.user.id !== session.user.id) uni.$emit('cozi:session-changed'); }
export function clearSession() { const previous = getSession(); uni.removeStorageSync(SESSION_KEY); if (previous) uni.$emit('cozi:session-changed'); }
let redirecting = false;
export function requireSession() {
  if (getSession()?.user.role === 'advertiser') return true;
  if (!redirecting) { redirecting = true; uni.reLaunch({ url: '/pages/login/login', complete: () => { redirecting = false; } }); }
  return false;
}
export function uuid() {
  // Request identifiers only, never authentication secrets. Also available in the WeChat runtime.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const digit = Math.floor(Math.random() * 16); return (char === 'x' ? digit : (digit & 3) | 8).toString(16);
  });
}
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request<T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', data?: unknown, key?: string): Promise<T> {
  const session = getSession();
  const commandStorage = `cozi-command:${session?.user.id}:${method}:${path}`;
  const signature = JSON.stringify(data ?? null);
  if (key) {
    const previous = uni.getStorageSync(commandStorage);
    if (previous?.signature === signature) key = previous.key;
    else uni.setStorageSync(commandStorage, { signature, key });
  }
  const clearCommand = () => { if (key && uni.getStorageSync(commandStorage)?.key === key) uni.removeStorageSync(commandStorage); };
  return new Promise((resolve, reject) => uni.request({
    url: `${API_BASE}${path}`, method, data: data as Record<string, unknown>, timeout: 20000,
    header: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    success(response) {
      const body = response.data as { success?: boolean; data?: T; message?: string };
      if (response.statusCode >= 200 && response.statusCode < 300 && body?.success) { clearCommand(); return resolve(body.data as T); }
      if (response.statusCode >= 400 && response.statusCode < 500 && ![408, 429].includes(response.statusCode)) clearCommand();
      if (response.statusCode === 401 && path !== '/auth/login' && path !== '/auth/wechat/mini-login' && getSession()?.token === session?.token) { clearSession(); requireSession(); }
      reject(new ApiError(body?.message || '请求失败，请稍后重试', response.statusCode));
    },
    fail: () => reject(new ApiError('网络连接失败，请检查网络后重试', 0)),
  }));
}
const orderPath = (id: string) => `/collaboration/orders/${encodeURIComponent(id)}`;
export const api = {
  login: (identifier: string, password: string) => request<Session>('/auth/login', 'POST', { identifier, password, role: 'advertiser' }),
  wechatLogin: (code: string) => request<WechatMiniLoginResult>('/auth/wechat/mini-login', 'POST', { code, bindFlow: true }),
  wechatBind: (bindTicket: string, identifier: string, password: string) => request<Session>('/auth/wechat/mini-bind', 'POST', { bindTicket, identifier, password }),
  wechatRegister: (bindTicket: string, name: string) => request<Session>('/auth/wechat/mini-register', 'POST', { bindTicket, name }),
  me: () => request<MiniUser>('/auth/me'),
  orders: (offset = 0) => request<CollaborationOrderSummary[]>(`/collaboration/orders?offset=${offset}`),
  workspace: (id: string) => request<CollaborationWorkspace>(orderPath(id)),
  templates: () => request<FormTemplate[]>('/form-templates/published'),
  orderFormTemplates: () => request<FormTemplate[]>('/form-templates/published?target=order'),
  createForm: (id: string, template: FormTemplate, key: string) => request<CollaborationForm>(`${orderPath(id)}/forms`, 'POST', { templateId: template.id, templateVersion: template.publishedVersion || template.version }, key),
  saveForm: (id: string, form: CollaborationForm, answers: FormAnswers, submit: boolean, key: string) => request<CollaborationForm>(`${orderPath(id)}/forms/${form.id}${submit ? '/submit' : '/draft'}`, 'POST', { lockVersion: form.lockVersion, answers }, key),
  returnForm: (id: string, form: CollaborationForm, comment: string, key: string) => request<CollaborationForm>(`${orderPath(id)}/forms/${form.id}/return`, 'POST', { lockVersion: form.lockVersion, comment }, key),
  candidate: (id: string, workspace: CollaborationWorkspace, formIds: string[], key: string) => request<RequirementCandidate>(`${orderPath(id)}/candidates`, 'POST', { formIds, policy: workspace.designerId ? 'both' : 'brand', baseVersion: workspace.requirements[0]?.version || 0 }, key),
  decide: (id: string, candidate: RequirementCandidate, decision: 'confirmed' | 'rejected', comment: string, key: string) => request<RequirementCandidate>(`${orderPath(id)}/candidates/${candidate.id}/decisions`, 'POST', { contentHash: candidate.contentHash, decision, comment }, key),
  messages: (id: string, afterSeq: number) => request<{ messages: ChatMessage[]; hasMore: boolean }>(`/chat/orders/${encodeURIComponent(id)}/messages?afterSeq=${afterSeq}`),
  deliverableImages: (id: string) => request<DeliverableImage[]>(`/chat/orders/${encodeURIComponent(id)}/deliverable-images`),
  createAnnotation: (id: string, payload: { taskId: string; imageId: string; imageVersion: number; clientMessageId: string; annotations: Array<{ x: number; y: number; comment: string }> }) => request<ChatMessage>(`/chat/orders/${encodeURIComponent(id)}/annotations`, 'POST', payload),
  chatUnreadSummary: () => request<ChatUnreadSummary>('/chat/unread-summary'),
  markChatRead: (kind: 'order' | 'intake', conversationId: string, lastReadSeq: number) => request<{ kind: string; conversationId: string; lastReadSeq: number }>('/chat/read', 'POST', { kind, conversationId, lastReadSeq }),
  intakeSessions: () => request<IntakeSession[]>('/intake-sessions'),
  intakeSession: (id: string) => request<IntakeSession>(`/intake-sessions/${encodeURIComponent(id)}`),
  intakeInvite: (id: string) => request<{ token: string; expiresAt: string; path: string }>(`/intake-sessions/${encodeURIComponent(id)}/invite`, 'POST'),
  joinIntakeSession: (token: string) => request<{ id: string }>('/intake-sessions/join', 'POST', { token }),
  intakeMessages: (id: string, afterSeq: number) => request<{ messages: IntakeMessage[]; hasMore: boolean }>(`/intake-sessions/${encodeURIComponent(id)}/messages?afterSeq=${afterSeq}`),
  sendIntakeMessage: (id: string, clientMessageId: string, body: string) => request<IntakeMessage>(`/intake-sessions/${encodeURIComponent(id)}/messages`, 'POST', { clientMessageId, body }),
  messageSummary: () => request<{ unreadCount: number; categories: Array<{ type: SiteMessageType; total: number; unreadCount: number; latest: Pick<SiteMessage, 'id' | 'title' | 'content' | 'createdAt'> | null }> }>('/messages/summary'),
  messagesByType: (type: SiteMessageType, page = 1) => request<{ list: SiteMessage[]; filteredUnreadCount: number; hasMore: boolean }>(`/messages?type=${encodeURIComponent(type)}&page=${page}&pageSize=20`),
  messageDetail: (id: string) => request<SiteMessage>(`/messages/detail/${encodeURIComponent(id)}`),
  markMessageRead: (id: string) => request<SiteMessage>(`/messages/${encodeURIComponent(id)}/read`, 'POST', {}),
  markMessagesRead: (type?: SiteMessageType) => request<{ unreadCount: number }>('/messages/read-all', 'POST', type ? { type } : {}),
  designOrders: (status = 'all', keyword = '', page = 1, billingStatus = 'all') => request<DesignOrder[]>(`/design-orders/mine?status=${encodeURIComponent(status)}&keyword=${encodeURIComponent(keyword)}&billingStatus=${encodeURIComponent(billingStatus)}&page=${page}&pageSize=10`),
  designOrder: (id: string) => request<DesignOrder>(`/design-orders/${encodeURIComponent(id)}`),
  orderProgress: (id: string) => request<OrderProgress>(`/design-orders/${encodeURIComponent(id)}/progress`),
  reviewRules: () => request<ReviewRule[]>('/review-rules/mine'),
  orderPricing: () => request<OrderPricing>('/system-config/order-pricing'),
  createDesignOrder: (payload: Record<string, unknown>) => request<DesignOrder>('/design-orders', 'POST', payload),
  updateDesignOrder: (id: string, payload: Record<string, unknown>) => request<DesignOrder>(`/design-orders/${encodeURIComponent(id)}`, 'PUT', payload),
  orderAction: (id: string, action: 'cancel' | 'resubmit' | 'republish') => request<DesignOrder>(`/design-orders/${encodeURIComponent(id)}/${action}`, 'POST', {}),
};
export function assetUrl(path: string) {
  if (!/^\/api\/upload\/(previews|assets)\/[a-zA-Z0-9_-]+$/.test(path)) throw new Error('文件地址无效');
  return API_BASE.replace(/\/api$/, '') + path;
}
export async function downloadAsset(path: string, orderId?: string): Promise<string> {
  const session = getSession();
  if (!session) throw new Error('请先登录');
  const fileId = /^\/api\/upload\/assets\/(asset_[a-zA-Z0-9_-]+)$/.exec(path)?.[1];
  const url = fileId && orderId ? `${API_BASE}${orderPath(orderId)}/files/${fileId}` : assetUrl(path);
  return new Promise((resolve, reject) => uni.downloadFile({ url, header: { Authorization: `Bearer ${session.token}` },
    success: result => result.statusCode === 200 ? resolve(result.tempFilePath) : reject(new Error('文件读取失败或无权访问')),
    fail: () => reject(new Error('文件读取失败，请重试')) }));
}
export async function uploadAsset(filePath: string, image: boolean, requireOss = false): Promise<string> {
  const session = getSession();
  if (!session) throw new Error('请先登录');
  return new Promise((resolve, reject) => uni.uploadFile({ url: `${API_BASE}/upload`, filePath, name: 'file',
    header: { Authorization: `Bearer ${session.token}` }, formData: { folder: image ? 'order-reference-images' : 'order-materials', ...(requireOss ? { requireOss: 'true' } : {}) },
    success: result => {
      try {
        const body = JSON.parse(result.data);
        if (result.statusCode >= 200 && result.statusCode < 300 && body.success) {
          if (requireOss && body.data.storageType !== 'aliyun-oss') reject(new Error('聊天附件未保存到 OSS，请检查服务端存储配置后重试'));
          else resolve(body.data.url);
        } else reject(new Error(body.message || '上传失败'));
      } catch { reject(new Error('上传失败，请重试')); }
    }, fail: () => reject(new Error('上传失败，请检查网络')) }));
}
