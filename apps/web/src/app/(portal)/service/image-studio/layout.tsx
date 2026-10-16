import { notFound } from 'next/navigation';
import { getServerSessionClaims } from '@/lib/server-auth';

export default async function ServiceImageStudioLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSessionClaims();
  if (session?.role !== 'customer_service') notFound();
  return children;
}
