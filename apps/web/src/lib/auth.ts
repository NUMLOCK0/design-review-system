export interface UserInfo {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'advertiser' | 'designer' | 'customer_service' | 'admin';
  roles?: UserInfo['role'][];
  organizationId?: string;
  isOrganizationAdmin?: boolean;
  department?: string;
  avatarUrl?: string;
}

export const ROLE_HOME: Record<UserInfo['role'], string> = {
  advertiser: '/advertiser/dashboard',
  designer: '/order-market',
  customer_service: '/service/dashboard',
  admin: '/admin',
};

export const ROLE_LABEL: Record<UserInfo['role'], string> = {
  advertiser: '品牌方',
  designer: '设计师',
  customer_service: '客服',
  admin: '系统管理员',
};

export function getRoleHome(role: UserInfo['role']): string {
  return ROLE_HOME[role] || ROLE_HOME.designer;
}

const API_BASE_URL = '/api';
export const AUTH_EXPIRED_NOTICE_KEY = 'auth-expired-notice';
let redirectingAfterUnauthorized = false;

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

export function getCurrentUser(): UserInfo | null {
  if (typeof window === 'undefined') return null;
  const userJson = localStorage.getItem('auth_user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, user: UserInfo) {
  if (typeof window === 'undefined') return;
  // 新会话由服务端 HttpOnly Cookie 承载 Token，保留旧 Token 的读取逻辑仅用于兼容已登录用户。
  localStorage.removeItem('auth_token');
  localStorage.setItem('auth_user', JSON.stringify(user));
  // 触发全局事件通知组件更新
  window.dispatchEvent(new Event('auth-state-change'));
}

export function updateCurrentUserName(name: string) {
  if (typeof window === 'undefined') return;
  const user = getCurrentUser();
  if (!user) return;
  localStorage.setItem('auth_user', JSON.stringify({ ...user, name }));
  window.dispatchEvent(new Event('auth-state-change'));
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  void fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include', keepalive: true }).catch(() => undefined);
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  window.dispatchEvent(new Event('auth-state-change'));
}

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  const method = (options.method || 'GET').toUpperCase();
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // GET/HEAD 请求不自动添加 Content-Type。受保护图片会 302 到 OSS，
  // OSS 会将该请求头纳入签名校验；额外携带 application/json 会导致
  // SignatureDoesNotMatch。只有实际发送请求体的方法才需要默认 JSON 类型。
  const hasRequestBody = !['GET', 'HEAD'].includes(method) && !(options.body instanceof FormData);
  if (!headers.has('Content-Type') && hasRequestBody) {
    headers.set('Content-Type', 'application/json');
  }

  const isAbsoluteUrl = /^https?:\/\//i.test(url);
  const alreadyHasApiPrefix = url === API_BASE_URL || url.startsWith(`${API_BASE_URL}/`);
  const fullUrl = isAbsoluteUrl || alreadyHasApiPrefix
    ? url
    : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  
  const response = await fetch(fullUrl, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (response.status === 401 && typeof window !== 'undefined') {
    if (window.location.pathname.startsWith('/login')) {
      clearAuthSession();
    } else if (!redirectingAfterUnauthorized) {
      redirectingAfterUnauthorized = true;
      try {
        window.sessionStorage.setItem(AUTH_EXPIRED_NOTICE_KEY, '登录状态已失效，请重新登录');
      } catch {
        // 页面跳转仍继续；存储不可用时无法跨页面保留提示。
      }
      const redirect = window.location.pathname + window.location.search;
      clearAuthSession();
      window.location.replace('/login?redirect=' + encodeURIComponent(redirect));
    }
  }

  return response;
}
