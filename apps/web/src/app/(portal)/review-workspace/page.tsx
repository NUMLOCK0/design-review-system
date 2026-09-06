import { redirect } from 'next/navigation';

export default function WorkspaceRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  redirect('/admin/review-workspace');
}
