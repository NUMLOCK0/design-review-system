'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { getCurrentUser, getRoleHome, ROLE_LABEL, UserInfo } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-current-user';

interface RolePlaceholderProps {
  roles: UserInfo['role'][];
  title: string;
  nextSteps: Array<{ label: string; href: string }>;
}

export function RolePlaceholder({ roles, title, nextSteps }: RolePlaceholderProps) {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!roles.includes(user.role)) {
      router.replace(getRoleHome(user.role));
    }
  }, [roles, router]);

  const user = useCurrentUser();

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-blue-600">{user ? ROLE_LABEL[user.role] : '角色空间'}</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {nextSteps.map((item) => (
          <Link key={item.href} href={item.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-bold text-slate-800">{item.label}</h2>
              <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
