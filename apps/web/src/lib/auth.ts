export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: 'advertiser' | 'designer' | 'customer_service' | 'admin';
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

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
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
  // 触发全局事件通知组件更新
  window.dispatchEvent(new Event('auth-state-change'));
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  window.dispatchEvent(new Event('auth-state-change'));
}

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  
  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    }
  }

  return response;
}
