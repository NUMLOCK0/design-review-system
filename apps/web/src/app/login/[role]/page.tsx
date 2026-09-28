import { notFound } from 'next/navigation';
import { LoginPage } from '@/components/auth/login-page';

const entries = ['advertiser', 'designer', 'staff'] as const;

export default async function RoleLoginPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!entries.includes(role as typeof entries[number])) notFound();
  return <LoginPage entryRole={role as typeof entries[number]} />;
}
