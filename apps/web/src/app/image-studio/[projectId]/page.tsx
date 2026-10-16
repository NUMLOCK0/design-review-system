import { redirect } from 'next/navigation';

export default async function LegacyImageStudioProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/service/image-studio/${encodeURIComponent(projectId)}`);
}
