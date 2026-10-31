import '@design-review/infinite-canvas/styles.css';
import { ImageStudioWorkbench } from '@/components/image-studio/workbench-v2';

export default async function ServiceImageStudioProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ImageStudioWorkbench projectId={projectId} />;
}
