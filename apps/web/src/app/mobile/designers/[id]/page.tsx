import { DesignerPublicProfile } from '@/components/designer-public-profile';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';

export default function DesignerPage() {
  return <MobileSecondaryLayout title="设计师主页与作品" fallbackHref="/mobile/orders"><DesignerPublicProfile /></MobileSecondaryLayout>;
}
