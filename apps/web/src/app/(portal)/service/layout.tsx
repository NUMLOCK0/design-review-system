import { notFound, redirect } from 'next/navigation';
import { getServerSessionClaims } from '@/lib/server-auth';

export default async function ServiceLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSessionClaims();
  if (!session) redirect('/login?redirect=%2Fservice%2Fdashboard');
  if (session.role !== 'customer_service' && session.role !== 'admin') notFound();
  return children;
}
