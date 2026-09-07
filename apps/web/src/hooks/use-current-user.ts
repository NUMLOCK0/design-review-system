'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, type UserInfo } from '@/lib/auth';

export function useCurrentUser() {
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    const syncUser = () => setUser(getCurrentUser());
    syncUser();
    window.addEventListener('auth-state-change', syncUser);
    return () => window.removeEventListener('auth-state-change', syncUser);
  }, []);

  return user;
}
