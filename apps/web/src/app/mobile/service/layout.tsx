import { notFound, redirect } from 'next/navigation';
import { getServerSessionClaims } from '@/lib/server-auth';

export default async function MobileServiceLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSessionClaims();
  if (!session) redirect('/login/staff?redirect=%2Fmobile%2Fservice%2Fportfolio-review');
  if (session.role !== 'customer_service' && session.role !== 'admin') notFound();
  return children;
}
