import { ImageStudioWorkflow } from '@/components/image-studio/workspace-flow';

export default async function ServiceImageStudioProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ImageStudioWorkflow projectId={projectId} />;
}
