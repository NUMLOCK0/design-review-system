import type { OrderImageRequirementImageItem, OrderReferenceLinkItem } from '@design-review/shared';
import { ExternalLink } from 'lucide-react';
import { AuthenticatedImage } from '@/components/authenticated-image';

function getReferenceItems(item: OrderImageRequirementImageItem): OrderReferenceLinkItem[] {
  if (item.referenceLinkItems?.some((reference) => reference.image || reference.link || reference.description)) return item.referenceLinkItems;
  const images = item.referenceImages || [];
  const links = item.referenceLinks || [];
  return Array.from({ length: Math.max(images.length, links.length) }, (_, index) => ({
    id: `${item.id}-reference-${index}`,
    image: images[index] || '',
    link: links[index] || '',
    description: index === 0 ? item.referenceLinkDescription || '' : '',
  }));
}

export function ReferenceLinkItemsDetail({ item, compact = false, onPreview }: {
  item: OrderImageRequirementImageItem;
  compact?: boolean;
  onPreview?: (url: string, label: string) => void;
}) {
  const references = getReferenceItems(item).filter((reference) => reference.image || reference.link || reference.description);
  if (!references.length) return null;

  return <div className="sm:col-span-2">
    <p className={`${compact ? 'mb-1 text-[10px]' : 'mb-2 text-[11px]'} font-medium text-slate-500`}>竞品参考</p>
    <div className="space-y-1.5">
      {references.map((reference, index) => <div key={reference.id || index} className={`flex min-w-0 items-start gap-2 rounded-lg border border-slate-200 bg-white ${compact ? 'p-1.5' : 'p-2'}`}>
        {reference.image && (onPreview ? <button type="button" onClick={() => onPreview(reference.image!, `参考图${index + 1}`)} className="shrink-0 overflow-hidden rounded-md"><AuthenticatedImage src={reference.image} alt={`参考图${index + 1}`} className={`${compact ? 'h-10 w-10' : 'h-14 w-14'} object-cover`} /></button> : <AuthenticatedImage src={reference.image} alt={`参考图${index + 1}`} className={`${compact ? 'h-10 w-10' : 'h-14 w-14'} shrink-0 rounded-md object-cover`} />)}
        <div className="min-w-0 flex-1 space-y-0.5">
          {reference.link && <a href={reference.link} target="_blank" rel="noreferrer" className={`${compact ? 'text-[10px]' : 'text-[11px]'} flex min-w-0 items-center gap-1 truncate text-blue-600 hover:underline`}><ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{reference.link}</span></a>}
          {reference.description && <p className={`${compact ? 'text-[10px]' : 'text-[11px]'} whitespace-pre-wrap break-words leading-5 text-slate-500`}>{reference.description}</p>}
        </div>
      </div>)}
    </div>
  </div>;
}
