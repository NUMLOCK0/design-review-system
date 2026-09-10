'use client';

import { useEffect } from 'react';
import { getCurrentUser } from '@/lib/auth';

export function RoleTheme() {
  useEffect(() => {
    const syncTheme = () => {
      const role = getCurrentUser()?.role;
      document.documentElement.dataset.roleTheme = role === 'designer' ? 'designer' : 'brand';
    };
    syncTheme();
    window.addEventListener('auth-state-change', syncTheme);
    return () => window.removeEventListener('auth-state-change', syncTheme);
  }, []);

  return null;
}
