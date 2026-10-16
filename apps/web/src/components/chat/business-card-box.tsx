'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, Check, ChevronRight, ImagePlus, Layers3, Megaphone, Package, Plus, Search, ShoppingBag, Sparkles, Trash2, X } from 'lucide-react';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseChatCard, type ChatCard } from '@/lib/chat-cards';
import { BUSINESS_CARD_CATEGORIES, BUSINESS_CARD_DEFINITIONS, type BusinessCardDefinition } from '@/lib/business-card-definitions';
import { ToolButton, type SendCard } from './tools/tool-ui';

type WorkCard = Extract<ChatCard, { kind: 'work_card' }>;
type Attachment = WorkCard['attachments'][number];
type ReferenceDraft = { id: string; link: string; description: string; attachments: Attachment[] };
type ItemDraft = { id: string; name: string; specification: string; rawAttachments: Attachment[]; designNotes: string; references: ReferenceDraft[] };
type ChatHistoryMessage = { id: string; senderName: string; createdAt: string; body: string };
type ChatImageOption = Attachment & { messageId: string; senderName: string; createdAt: string; context: string };

const MAX_SKUS = 8;
const MAX_REFERENCES = 8;
const MAX_ATTACHMENTS = 8;
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const CUSTOM_SPECIFICATION = '__custom_specification__';
const SPECIFICATION_OPTIONS: Record<string, string[]> = {
  biz_1: ['1:1 方形主图 · 800 × 800 px', '1:1 方形主图 · 1000 × 1000 px', '3:4 竖版商品图 · 750 × 1000 px', '4:3 横版商品图 · 800 × 600 px'],
  biz_2: ['手机端详情页 · 750 px 标准宽度', 'PC 端详情页 · 1920 px 标准宽度', '移动端 + PC 端适配'],
  biz_3: ['平台投放图 · 800 × 800 px', '1:1 方形投放图 · 1000 × 1000 px', '3:4 竖版投放图 · 750 × 1000 px', '9:16 竖屏投放图 · 1080 × 1920 px'],
  biz_4: ['线下印刷海报 · 易拉宝 80 × 200 cm', 'A3 海报 · 29.7 × 42 cm', 'A4 海报 · 21 × 29.7 cm', '线上竖版海报 · 1080 × 1920 px'],
  biz_5: ['竖版封面 · 3:4 / 1242 × 1660 px', '竖版封面 · 3:4 / 1080 × 1440 px', '方形封面 · 1:1 / 1080 × 1080 px'],
  biz_6: ['竖屏封面 · 9:16 / 1080 × 1920 px', '竖屏封面 · 9:16 / 720 × 1280 px', '横屏封面 · 16:9 / 1920 × 1080 px', '方形封面 · 1:1 / 1080 × 1080 px'],
  biz_7: ['待重排图片 · 按原图比例', '方形画布 · 1:1', '竖版画布 · 3:4', '竖屏画布 · 9:16'],
  biz_8: ['单图改字 · 按原图比例', '方形画布 · 1:1', '竖版画布 · 3:4', '竖屏画布 · 9:16'],
  biz_9: ['单张精修 · 原始尺寸优先', '方形画布 · 1:1', '竖版画布 · 3:4', '横版画布 · 4:3'],
  biz_10: ['主标方案 · 矢量规范交付', '横版组合标 · 矢量文件', '竖版组合标 · 矢量文件', '独立图标 · 矢量文件'],
  biz_11: ['外包装纸盒 · 展开图与刀版', '小型纸盒 · 展开图与刀版', '手提袋 · 展开图与刀版'],
  biz_12: ['核心提案页 · 16:9 宽屏', '标准页面 · 4:3', 'A4 横版 · 29.7 × 21 cm'],
  biz_13: ['PC + 无线端首页 / 活动页', 'PC 端页面 · 1920 px 标准宽度', '无线端页面 · 750 px 标准宽度'],
};

function definitionById(id?: string) {
  return BUSINESS_CARD_DEFINITIONS.find(item => item.id === id) || BUSINESS_CARD_DEFINITIONS[0];
}

function specificationOptions(definition: BusinessCardDefinition) {
  return [...new Set([definition.specification, ...(SPECIFICATION_OPTIONS[definition.id] || [])])];
}

function categoryFor(definition: BusinessCardDefinition) {
  return BUSINESS_CARD_CATEGORIES.find(category => category.id === definition.categoryId) || BUSINESS_CARD_CATEGORIES[0];
}

function newReference(id: string): ReferenceDraft {
  return { id, link: '', description: '', attachments: [] };
}

function newItem(definition: BusinessCardDefinition, index: number, withReference = true): ItemDraft {
  return { id: `sku-${index}`, name: index === 1 ? '基础规格' : `子项 ${index}`, specification: definition.specification, rawAttachments: [], designNotes: '', references: withReference ? [newReference(`ref-${index}-1`)] : [] };
}

function parsePreviousCard(card: WorkCard | undefined, definition: BusinessCardDefinition) {
  if (!card) return { items: [] as ItemDraft[], redline: definition.redline, legacySummary: '' };
  const fields = card.fields;
  const specsField = fields.find(field => field.label === '规格 / SKU');
  const specs = specsField?.value.split('\n').map(line => {
    const match = /^\s*\d+\.\s*(.*?)\s*[·|｜]\s*(.*)$/.exec(line);
    return match ? { name: match[1], specification: match[2] } : null;
  }).filter((value): value is { name: string; specification: string } => Boolean(value));
  const designFields = fields.filter(field => field.label.startsWith('设计要点 · '));
  const referenceFields = fields.filter(field => field.label.startsWith('参考项 '));
  const knownLabels = new Set(['业务类型', '规格 / SKU', '素材文件', '业务避坑红线', '历史卡片内容']);
  const legacy = fields.filter(field => !knownLabels.has(field.label) && !field.label.startsWith('设计要点 · ') && !field.label.startsWith('参考项 '));
  const structured = Boolean(specs?.length || designFields.length || referenceFields.length);

  const items: ItemDraft[] = specs?.length
    ? specs.slice(0, MAX_SKUS).map((spec, index) => {
      const itemReferences = referenceFields.filter(field => field.label.endsWith(`· ${spec.name}`)).slice(0, MAX_REFERENCES).map((field, refIndex) => {
        const link = /^链接：(.+)$/m.exec(field.value)?.[1] || '';
        const description = /^说明：([\s\S]*?)(?:\n图片：|$)/.exec(field.value)?.[1]?.trim() || '';
        const numberedReference = /^参考项\s+(\d+)/.exec(field.label)?.[1];
        const attachments = card.attachments.filter(attachment => attachment.name.startsWith(`【${spec.name}·参考${numberedReference || refIndex + 1}】`));
        return { ...newReference(`ref-${index + 1}-${refIndex + 1}`), link, description, attachments };
      });
      return {
        ...newItem(definition, index + 1, itemReferences.length === 0),
        name: spec.name || `子项 ${index + 1}`,
        specification: spec.specification || definition.specification,
        designNotes: designFields.find(field => field.label === `设计要点 · ${spec.name}`)?.value || '',
        references: itemReferences.length ? itemReferences : [newReference(`ref-${index + 1}-1`)],
        rawAttachments: card.attachments.filter(item => item.name.startsWith(`【${spec.name}·素材】`)),
      };
    })
    : [
      {
        ...newItem(definition, 1),
        designNotes: structured ? designFields[0]?.value || '' : '',
        rawAttachments: card.attachments,
        references: [newReference('ref-1-1')],
      },
    ];

  const redline = fields.find(field => field.label === '业务避坑红线')?.value || definition.redline;
  const storedLegacy = fields.find(field => field.label === '历史卡片内容')?.value;
  const legacySummary = storedLegacy || (structured ? legacy.map(field => `${field.label}：${field.value}`).join('\n') : fields.map(field => `${field.label}：${field.value}`).join('\n'));
  return { items: items.length ? items : [newItem(definition, 1)], redline, legacySummary };
}

function categoryIcon(categoryId: string) {
  if (categoryId === 'commerce') return ShoppingBag;
  if (categoryId === 'content') return Megaphone;
  if (categoryId === 'image') return ImagePlus;
  if (categoryId === 'brand') return Package;
  if (categoryId === 'presentation') return BriefcaseBusiness;
  return Layers3;
}

function allAttachments(items: ItemDraft[]) {
  return items.flatMap(item => [...item.rawAttachments, ...item.references.flatMap(reference => reference.attachments)]);
}

function imagesFromChat(messages: ChatHistoryMessage[]): ChatImageOption[] {
  const options = new Map<string, ChatImageOption>();
  for (const message of [...messages].reverse()) {
    const card = parseChatCard(message.body);
    let candidates: Array<{ name: string; url: string }> = [];
    let context = '聊天图片';
    if (card?.kind === 'image') {
      candidates = card.attachments;
      context = card.caption.trim() || '图片消息';
    } else if (card?.kind === 'work_card' || card?.kind === 'choice') {
      candidates = card.attachments || [];
      context = card.title || '协作卡片图片';
    } else if (card?.kind === 'annotation' && card.imageUrl.startsWith('/api/upload/previews/')) {
      candidates = [{ name: `${card.productName} · 批注图片`, url: card.imageUrl }];
      context = '图片批注';
    } else {
      const rawImage = /^\/api\/upload\/previews\/(asset_[a-f0-9]{32})$/.exec(message.body.trim());
      if (rawImage) candidates = [{ name: '聊天图片', url: `/api/upload/previews/${rawImage[1]}` }];
    }
    for (const candidate of candidates) {
      if (!/^\/api\/upload\/previews\/asset_[a-f0-9]{32}$/.test(candidate.url) || options.has(candidate.url)) continue;
      options.set(candidate.url, {
        ...candidate,
        name: candidate.name.trim() || '聊天图片',
        messageId: message.id,
        senderName: message.senderName,
        createdAt: message.createdAt,
        context,
      });
    }
  }
  return [...options.values()];
}

function chatTimeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function BusinessCardPreview({ definition, title, items, redline }: { definition: BusinessCardDefinition; title: string; items: ItemDraft[]; redline: string }) {
  const allImages = allAttachments(items);
  const images = allImages.slice(0, 4);
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Layers3 className="h-4 w-4" /></span><div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-800">{title || '业务需求卡'}</h4><p className="mt-0.5 text-[10px] text-slate-400">{definition.name} · {items.length} 个规格 / 子项</p></div></div>
    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">{items.map((item, index) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-slate-700">{index + 1}. {item.name || `子项 ${index + 1}`}</p><span className="shrink-0 text-[10px] text-slate-400">{item.rawAttachments.length} 张素材</span></div><p className="mt-1 text-[10px] text-slate-500">{item.specification || '规格待补充'}</p><p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600">{item.designNotes || '设计要点待填写'}</p><p className="mt-2 text-[10px] text-slate-400">参考项 {item.references.filter(reference => reference.link.trim() || reference.description.trim() || reference.attachments.length).length} 个</p></div>)}</div>
    {images.length > 0 && <div className="mt-3 grid grid-cols-4 gap-1.5">{images.map((image, index) => <AuthenticatedImage key={`${image.url}-${index}`} src={image.url} alt={image.name} className="aspect-square w-full rounded-lg object-cover" />)}{allImages.length > images.length && <div className="flex aspect-square items-center justify-center rounded-lg bg-slate-100 text-[10px] font-semibold text-slate-500">+{allImages.length - images.length}</div>}</div>}
    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3"><p className="text-[10px] font-semibold text-amber-800">制作注意事项</p><p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] leading-5 text-amber-900/80">{redline || '可填写本业务的制作注意事项。'}</p></div>
  </div>;
}

function ImageSlot({ title, hint, attachments, disabled, removeDisabled, chatImageCount, onPick, onPickFromChat, onRemove }: { title: string; hint: string; attachments: Attachment[]; disabled: boolean; removeDisabled: boolean; chatImageCount: number; onPick: (files: FileList | null) => void; onPickFromChat: () => void; onRemove: (index: number) => void }) {
  return <div>
    {attachments.length > 0 && <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{attachments.map((attachment, index) => <div key={`${attachment.url}-${index}`} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white"><AuthenticatedImage src={attachment.url} alt={attachment.name} className="aspect-square w-full object-cover" /><button type="button" aria-label={`移除 ${attachment.name}`} disabled={removeDisabled} onClick={() => onRemove(index)} className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1.5 text-slate-500 shadow transition hover:text-rose-600 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button><p className="truncate px-2 py-1.5 text-[10px] text-slate-500">{attachment.name}</p></div>)}</div>}
    <div className={`flex min-w-0 flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm"><ImagePlus className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block break-words text-xs font-semibold text-slate-700">{title}</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">{hint} · JPG、PNG、WebP 或 GIF，单张不超过 15 MB</span></span></div>
      <div className="grid w-full grid-cols-1 gap-2"><label className={`flex min-h-10 w-full cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-medium text-slate-600 hover:bg-slate-100 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>本地上传<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" disabled={disabled} onChange={event => { onPick(event.currentTarget.files); event.currentTarget.value = ''; }} /></label><button type="button" disabled={disabled} onClick={onPickFromChat} className="min-h-10 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45">从聊天选择{chatImageCount > 0 ? ` · ${chatImageCount}` : ''}</button></div>
    </div>
  </div>;
}

function makeWorkCard(definition: BusinessCardDefinition, title: string, items: ItemDraft[], redline: string, legacySummary: string, revisionOf?: string): WorkCard {
  const fields: WorkCard['fields'] = [
    { label: '业务类型', value: definition.name },
    { label: '规格 / SKU', value: items.map((item, index) => `${index + 1}. ${item.name.trim()} · ${item.specification.trim() || definition.specification}`).join('\n') },
    { label: '素材文件', value: items.map(item => `${item.name.trim()}：${item.rawAttachments.length ? `已添加 ${item.rawAttachments.length} 张图片` : '暂未添加图片素材'}`).join('\n') },
    ...items.map(item => ({ label: `设计要点 · ${item.name.trim()}`.slice(0, 80), value: item.designNotes.trim() })),
    ...items.flatMap(item => item.references.filter(reference => reference.link.trim() || reference.description.trim() || reference.attachments.length).map((reference, index) => ({
      label: `参考项 ${index + 1} · ${item.name.trim()}`.slice(0, 80),
      value: [`链接：${reference.link.trim() || '未提供'}`, `说明：${reference.description.trim() || '未填写'}`, `图片：${reference.attachments.length ? `已添加 ${reference.attachments.length} 张` : '未添加'}`].join('\n'),
    }))),
    { label: '业务避坑红线', value: redline.trim() || definition.redline },
    ...(legacySummary.trim() ? [{ label: '历史卡片内容', value: legacySummary.trim().slice(0, 800) }] : []),
  ];
  const attachments = items.flatMap(item => [
    ...item.rawAttachments.map(image => ({ name: `【${item.name.trim()}·素材】${image.name}`.slice(0, 120), url: image.url })),
    ...item.references.flatMap((reference, referenceIndex) => reference.attachments.map(image => ({ name: `【${item.name.trim()}·参考${referenceIndex + 1}】${image.name}`.slice(0, 120), url: image.url }))),
  ]).slice(0, MAX_ATTACHMENTS);
  return { kind: 'work_card', templateId: definition.id, title: title.trim(), fields, attachments, ...(revisionOf ? { revisionOf } : {}) };
}

export function BusinessCardBox({ onClose, onSend, initial, revisionOf, messages = [] }: { onClose: () => void; onSend: SendCard; initial?: WorkCard; revisionOf?: string; messages?: ChatHistoryMessage[] }) {
  const initialDefinition = definitionById(initial?.templateId);
  const parsedInitial = parsePreviousCard(initial, initialDefinition);
  const [step, setStep] = useState<'catalog' | 'configure'>(initial ? 'configure' : 'catalog');
  const [categoryId, setCategoryId] = useState(initial ? initialDefinition.categoryId : 'all');
  const [definitionId, setDefinitionId] = useState(initial?.templateId || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [items, setItems] = useState<ItemDraft[]>(parsedInitial.items);
  const [selectedItemId, setSelectedItemId] = useState(parsedInitial.items[0]?.id || 'sku-1');
  const [redline, setRedline] = useState(parsedInitial.redline);
  const [legacySummary, setLegacySummary] = useState(parsedInitial.legacySummary);
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [chatPickerTarget, setChatPickerTarget] = useState<{ itemId: string; referenceId?: string } | null>(null);
  const [chatPickerSelection, setChatPickerSelection] = useState<string[]>([]);
  const [chatPickerSearch, setChatPickerSearch] = useState('');
  const [chatPickerLimit, setChatPickerLimit] = useState(60);

  const definition = definitionById(definitionId);
  const selectedItem = items.find(item => item.id === selectedItemId) || items[0];
  const currentSpecificationOptions = specificationOptions(definition);
  const specificationChoice = selectedItem && currentSpecificationOptions.includes(selectedItem.specification) ? selectedItem.specification : CUSTOM_SPECIFICATION;
  const attachmentsTotal = allAttachments(items).length;
  const chatImages = useMemo(() => imagesFromChat(messages), [messages]);
  const attachedUrls = useMemo(() => new Set(allAttachments(items).map(item => item.url)), [items]);
  const availableChatImageCount = chatImages.filter(image => !attachedUrls.has(image.url)).length;
  const pickerImages = useMemo(() => chatImages.filter(image => !attachedUrls.has(image.url) && (!chatPickerSearch.trim() || `${image.name} ${image.context} ${image.senderName}`.toLocaleLowerCase().includes(chatPickerSearch.trim().toLocaleLowerCase()))), [chatImages, attachedUrls, chatPickerSearch]);
  const referencesTotal = items.reduce((total, item) => total + item.references.length, 0);
  const cardLength = useMemo(() => JSON.stringify(makeWorkCard(definition, title, items, redline, legacySummary, revisionOf)).length + 18, [definition, title, items, redline, legacySummary, revisionOf]);
  const filteredDefinitions = useMemo(() => BUSINESS_CARD_DEFINITIONS.filter(item => {
    const matchesCategory = categoryId === 'all' || item.categoryId === categoryId;
    const searchText = `${item.name} ${item.tag} ${item.notesPlaceholder} ${item.materialLabel}`.toLocaleLowerCase();
    return matchesCategory && (!query.trim() || searchText.includes(query.trim().toLocaleLowerCase()));
  }), [categoryId, query]);
  const completedItems = items.filter(item => item.name.trim() && item.designNotes.trim()).length;
  const busy = uploading || sending;

  const chooseDefinition = (nextDefinition: BusinessCardDefinition) => {
    setDefinitionId(nextDefinition.id);
    setCategoryId(nextDefinition.categoryId);
    setTitle(`【${nextDefinition.name}】需求卡`);
    const firstItem = newItem(nextDefinition, 1);
    setItems([firstItem]);
    setSelectedItemId(firstItem.id);
    setRedline(nextDefinition.redline);
    setLegacySummary('');
    setError('');
    setStep('configure');
  };

  const updateItem = (itemId: string, update: (current: ItemDraft) => ItemDraft) => {
    setItems(current => current.map(item => item.id === itemId ? update(item) : item));
  };

  const addItem = () => {
    if (items.length >= MAX_SKUS) return;
    let itemNumber = items.length + 1;
    let item = newItem(definition, itemNumber, referencesTotal < MAX_REFERENCES);
    while (items.some(existing => existing.name.trim() === item.name)) {
      itemNumber += 1;
      item = newItem(definition, itemNumber, referencesTotal < MAX_REFERENCES);
    }
    item.id = crypto.randomUUID();
    setItems(current => [...current, item]);
    setSelectedItemId(item.id);
  };

  const removeItem = (itemId: string) => {
    if (items.length <= 1) return;
    const index = items.findIndex(item => item.id === itemId);
    const next = items.filter(item => item.id !== itemId);
    setItems(next);
    if (selectedItemId === itemId) setSelectedItemId(next[Math.max(0, index - 1)]?.id || next[0].id);
  };

  const addReference = (itemId: string) => {
    if (referencesTotal >= MAX_REFERENCES) {
      setError(`一张需求卡最多添加 ${MAX_REFERENCES} 个参考项`);
      return;
    }
    updateItem(itemId, item => ({ ...item, references: [...item.references, newReference(crypto.randomUUID())] }));
    setError('');
  };

  const removeReference = (itemId: string, referenceId: string) => {
    updateItem(itemId, item => ({ ...item, references: item.references.filter(reference => reference.id !== referenceId) }));
  };

  const uploadImages = async (files: FileList | null, itemId: string, referenceId?: string) => {
    if (!files?.length) return;
    const remaining = MAX_ATTACHMENTS - attachmentsTotal;
    if (remaining <= 0) {
      setError(`一张需求卡最多上传 ${MAX_ATTACHMENTS} 张图片`);
      return;
    }
    const selectedFiles = Array.from(files).slice(0, remaining);
    const validFiles = selectedFiles.filter(file => /^image\/(png|jpeg|webp|gif)$/.test(file.type) && file.size <= MAX_IMAGE_SIZE);
    if (validFiles.length !== selectedFiles.length) setError('已跳过不支持的文件；仅支持 15 MB 以内的 JPG、PNG、WebP 或 GIF 图片');
    if (!validFiles.length) return;
    setUploading(true);
    setUploadProgress(`正在上传 0/${validFiles.length}`);
    let uploadedCount = 0;
    try {
      for (const file of validFiles) {
        const uploaded = await (await import('@/lib/upload')).uploadFile(file, 'order-reference-images', { requireOss: true });
        const attachment: Attachment = { name: uploaded.filename, url: uploaded.url };
        updateItem(itemId, item => referenceId
          ? { ...item, references: item.references.map(reference => reference.id === referenceId ? { ...reference, attachments: [...reference.attachments, attachment] } : reference) }
          : { ...item, rawAttachments: [...item.rawAttachments, attachment] });
        uploadedCount += 1;
        setUploadProgress(`正在上传 ${uploadedCount}/${validFiles.length}`);
      }
      if (uploadedCount) setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片上传失败，请重试');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const removeAttachment = (itemId: string, index: number, referenceId?: string) => {
    updateItem(itemId, item => referenceId
      ? { ...item, references: item.references.map(reference => reference.id === referenceId ? { ...reference, attachments: reference.attachments.filter((_, attachmentIndex) => attachmentIndex !== index) } : reference) }
      : { ...item, rawAttachments: item.rawAttachments.filter((_, attachmentIndex) => attachmentIndex !== index) });
  };

  const openChatPicker = (itemId: string, referenceId?: string) => {
    setChatPickerTarget({ itemId, referenceId });
    setChatPickerSelection([]);
    setChatPickerSearch('');
    setChatPickerLimit(60);
  };

  const confirmChatImages = () => {
    if (!chatPickerTarget || !chatPickerSelection.length) return;
    const remaining = MAX_ATTACHMENTS - attachmentsTotal;
    if (remaining <= 0) {
      setError(`一张需求卡最多添加 ${MAX_ATTACHMENTS} 张图片`);
      setChatPickerTarget(null);
      return;
    }
    const selected = chatPickerSelection.slice(0, remaining).flatMap(url => {
      const image = chatImages.find(candidate => candidate.url === url);
      return image && !attachedUrls.has(image.url) ? [image] : [];
    });
    updateItem(chatPickerTarget.itemId, item => chatPickerTarget.referenceId
      ? { ...item, references: item.references.map(reference => reference.id === chatPickerTarget.referenceId ? { ...reference, attachments: [...reference.attachments, ...selected.map(({ name, url }) => ({ name, url }))] } : reference) }
      : { ...item, rawAttachments: [...item.rawAttachments, ...selected.map(({ name, url }) => ({ name, url }))] });
    setChatPickerTarget(null);
    setChatPickerSelection([]);
    setError('');
  };

  const submit = async () => {
    const validItems = items.filter(item => item.name.trim() && item.designNotes.trim());
    if (!definitionId || !title.trim()) {
      setError('请先选择业务类型并填写需求卡标题');
      return;
    }
    if (validItems.length !== items.length) {
      setError('每个规格 / 子项都需要填写名称和设计要点');
      return;
    }
    const itemNames = items.map(item => item.name.trim().toLocaleLowerCase());
    if (new Set(itemNames).size !== itemNames.length) {
      setError('每个规格 / 子项名称需要不同，方便区分素材和修订内容');
      return;
    }
    if (items.length > MAX_SKUS || referencesTotal > MAX_REFERENCES || attachmentsTotal > MAX_ATTACHMENTS) {
      setError(`最多支持 ${MAX_SKUS} 个规格、${MAX_REFERENCES} 个参考项和 ${MAX_ATTACHMENTS} 张图片`);
      return;
    }
    const card = makeWorkCard(definition, title, items, redline, legacySummary, revisionOf);
    if (card.fields.length > 24 || card.fields.some(field => field.value.length > 800)) {
      setError('内容过长，请减少规格、参考项或精简说明后再发送');
      return;
    }
    if (cardLength > 8000) {
      setError(`需求卡内容约 ${cardLength.toLocaleString()} 字符，超过消息上限；请精简说明后再发送`);
      return;
    }
    setSending(true);
    setError('');
    try {
      if (await onSend(card)) onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const close = () => { if (!busy) onClose(); };
  const titleId = 'business-card-box-title';
  const mobileStep = step === 'configure';

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} className="flex h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[90dvh] sm:rounded-2xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          {mobileStep && !initial && <button type="button" onClick={() => { setStep('catalog'); setError(''); }} aria-label="返回业务卡列表" disabled={busy} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ArrowLeft className="h-4 w-4" /></button>}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Layers3 className="h-5 w-5" /></span>
          <div className="min-w-0"><p className="text-[11px] font-semibold text-indigo-600">客服协作工具</p><h2 id={titleId} className="truncate text-base font-bold text-slate-900 sm:text-lg">{mobileStep ? (revisionOf ? '修订业务需求卡' : '配置业务需求卡') : '业务卡箱'}</h2></div>
        </div>
        <div className="flex shrink-0 items-center gap-3"><span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500 sm:inline-flex">{mobileStep ? `${items.length} 个规格 · ${attachmentsTotal}/${MAX_ATTACHMENTS} 张图片` : '13 类设计业务'}</span><button type="button" onClick={close} aria-label="关闭业务卡箱" disabled={busy} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X className="h-5 w-5" /></button></div>
      </header>

      {step === 'catalog' ? <div className="grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 overflow-y-auto border-r border-slate-100 bg-slate-50/70 p-4 md:block"><p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">业务分类</p><div className="space-y-1">{BUSINESS_CARD_CATEGORIES.map(category => { const Icon = categoryIcon(category.id); const count = category.id === 'all' ? BUSINESS_CARD_DEFINITIONS.length : BUSINESS_CARD_DEFINITIONS.filter(item => item.categoryId === category.id).length; return <button key={category.id} type="button" onClick={() => { setCategoryId(category.id); setQuery(''); }} aria-pressed={categoryId === category.id} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition ${categoryId === category.id ? 'bg-indigo-100 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-white'}`}><span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{category.label}</span><span className={`text-[10px] ${categoryId === category.id ? 'text-indigo-500' : 'text-slate-400'}`}>{count}</span></button>; })}</div><div className="mt-6 rounded-xl border border-indigo-100 bg-white p-3"><p className="text-xs font-semibold text-slate-700">按业务选卡</p><p className="mt-1.5 text-[11px] leading-5 text-slate-500">先选设计类型，再补充每个规格的素材、要点和参考。</p></div></aside>
        <main className="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-sm font-bold text-slate-900">选择业务类型</h3><p className="mt-1 text-xs text-slate-500">选择后可配置多个 SKU、原图素材、竞品参考和制作红线。</p></div><label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 sm:w-64"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索业务类型" className="min-w-0 flex-1 text-sm outline-none" /></label></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden">{BUSINESS_CARD_CATEGORIES.map(category => <button key={category.id} type="button" onClick={() => { setCategoryId(category.id); setQuery(''); }} aria-pressed={categoryId === category.id} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${categoryId === category.id ? 'bg-indigo-600 font-semibold text-white' : 'bg-slate-100 text-slate-600'}`}>{category.label}</button>)}</div><p className="mt-3 hidden text-[11px] text-slate-400 md:block">{BUSINESS_CARD_CATEGORIES.find(category => category.id === categoryId)?.description}</p></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{filteredDefinitions.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredDefinitions.map(item => { const Icon = categoryIcon(item.categoryId); return <button key={item.id} type="button" onClick={() => chooseDefinition(item)} className="group flex min-h-40 flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"><div className="flex w-full items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-100"><Icon className="h-5 w-5" /></span><span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] text-slate-400">{item.tag}</span></div><span className="mt-4 flex w-full items-center justify-between gap-2 text-sm font-semibold text-slate-800">{item.name}<ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" /></span><span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.notesPlaceholder}</span><span className="mt-auto pt-3 text-[10px] text-slate-400">默认规格：{item.specification}</span></button>; })}</div> : <div className="flex h-full min-h-48 flex-col items-center justify-center text-center"><Search className="h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">没有找到匹配的业务卡</p><p className="mt-1 text-xs text-slate-400">试试其他关键词或切换业务分类。</p></div>}</div>
        </main>
      </div> : <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_310px]">
        <main className="min-h-0 overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 sm:p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600"><Sparkles className="h-5 w-5" /></span><div className="min-w-0"><p className="text-sm font-semibold text-indigo-950">{definition.name} · 发送前预览与配置</p><p className="mt-1 text-xs leading-5 text-indigo-800/75">{categoryFor(definition).description} 可为不同规格分别填写素材和设计要求。</p><p className="mt-2 text-[11px] font-medium text-indigo-700">默认规格：{definition.specification}</p></div></div>

          <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(190px,0.75fr)]"><label className="block"><span className="text-xs font-semibold text-slate-700">需求卡标题</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder="填写需求卡标题" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-indigo-400" /></label><div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3"><p className="text-[11px] font-semibold text-slate-600">配置进度</p><p className="mt-1 text-sm font-bold text-slate-800">{completedItems} / {items.length} 个规格已填写</p><p className="mt-1 text-[10px] text-slate-400">图片 {attachmentsTotal}/{MAX_ATTACHMENTS} · 参考项 {referencesTotal}/{MAX_REFERENCES}</p></div></div>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-bold text-slate-900">规格与子项</h3><p className="mt-1 text-[11px] text-slate-500">不同 SKU 或交付规格可以分别填写要求。</p></div><button type="button" onClick={addItem} disabled={busy || items.length >= MAX_SKUS} className="inline-flex min-h-9 items-center justify-center gap-1.5 self-start rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 sm:self-auto"><Plus className="h-4 w-4" />添加新子项 / SKU</button></div><div className="mt-3 flex gap-2 overflow-x-auto border-b border-slate-100 pb-2">{items.map((item, index) => <div key={item.id} className={`flex shrink-0 items-center rounded-lg border ${selectedItem?.id === item.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><button type="button" onClick={() => setSelectedItemId(item.id)} aria-pressed={selectedItem?.id === item.id} className="max-w-48 truncate px-3 py-2 text-left text-xs font-medium text-slate-700">{index + 1}. {item.name || `子项 ${index + 1}`}</button>{items.length > 1 && <button type="button" aria-label={`删除 ${item.name || `子项 ${index + 1}`}`} disabled={busy} onClick={() => removeItem(item.id)} className="mr-1 rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-40"><X className="h-3.5 w-3.5" /></button>}</div>)}</div></section>

          {selectedItem && <div className="mt-3 space-y-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{items.findIndex(item => item.id === selectedItem.id) + 1}</span><div><h3 className="text-xs font-bold text-slate-800">子项信息</h3><p className="text-[10px] text-slate-400">命名并标注画布、平台或交付规格；名称需唯一。</p></div></div><div className="grid gap-3 sm:grid-cols-2"><label><span className="text-[11px] font-semibold text-slate-600">子项 / SKU 名称</span><input value={selectedItem.name} onChange={event => updateItem(selectedItem.id, item => ({ ...item, name: event.target.value }))} maxLength={24} placeholder="例如：主图首屏 / SKU 红色款" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" /></label><div><span className="text-[11px] font-semibold text-slate-600">画布尺寸 / 规格</span><Select value={specificationChoice} onValueChange={value => updateItem(selectedItem.id, item => ({ ...item, specification: value === CUSTOM_SPECIFICATION ? (specificationChoice === CUSTOM_SPECIFICATION ? item.specification : '') : value }))}><SelectTrigger className="mt-1.5 min-h-11"><SelectValue placeholder="选择尺寸或规格" /></SelectTrigger><SelectContent>{currentSpecificationOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}<SelectItem value={CUSTOM_SPECIFICATION}>自定义尺寸 / 规格</SelectItem></SelectContent></Select>{specificationChoice === CUSTOM_SPECIFICATION && <input value={selectedItem.specification} onChange={event => updateItem(selectedItem.id, item => ({ ...item, specification: event.target.value }))} maxLength={48} placeholder="填写尺寸或规格说明" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />}</div></div></section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3"><h3 className="text-xs font-bold text-slate-800">{definition.materialLabel}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{definition.materialHint}</p></div><ImageSlot title={selectedItem.rawAttachments.length ? '再添加素材图' : definition.materialPlaceholder} hint="商品原图或任务素材" attachments={selectedItem.rawAttachments} disabled={busy || attachmentsTotal >= MAX_ATTACHMENTS} removeDisabled={busy} chatImageCount={availableChatImageCount} onPick={files => void uploadImages(files, selectedItem.id)} onPickFromChat={() => openChatPicker(selectedItem.id)} onRemove={index => removeAttachment(selectedItem.id, index)} /></section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4"><label className="block"><span className="text-xs font-bold text-slate-800">{definition.notesLabel} <span className="text-rose-500">*</span></span><span className="mt-1 block text-[11px] leading-5 text-slate-500">{definition.notesPlaceholder}</span><textarea value={selectedItem.designNotes} onChange={event => updateItem(selectedItem.id, item => ({ ...item, designNotes: event.target.value }))} maxLength={800} rows={4} placeholder={definition.notesPlaceholder} className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-indigo-300 focus:bg-white" /><span className="mt-1 block text-right text-[10px] text-slate-400">{selectedItem.designNotes.length}/800</span></label></section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-xs font-bold text-slate-800">{definition.referenceLabel}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{definition.referenceHint}</p></div><button type="button" onClick={() => addReference(selectedItem.id)} disabled={busy || referencesTotal >= MAX_REFERENCES} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Plus className="h-3.5 w-3.5" />添加参考项</button></div>
              <div className="mt-3 space-y-3">{selectedItem.references.map((reference, index) => <div key={reference.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-600">对标项 {index + 1}</p><button type="button" aria-label={`删除参考项 ${index + 1}`} disabled={busy} onClick={() => removeReference(selectedItem.id, reference.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button></div><div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]"><div><ImageSlot title={reference.attachments.length ? '再加一张参考图' : '上传对标图'} hint="竞品或风格样张" attachments={reference.attachments} disabled={busy || attachmentsTotal >= MAX_ATTACHMENTS} removeDisabled={busy} chatImageCount={availableChatImageCount} onPick={files => void uploadImages(files, selectedItem.id, reference.id)} onPickFromChat={() => openChatPicker(selectedItem.id, reference.id)} onRemove={attachmentIndex => removeAttachment(selectedItem.id, attachmentIndex, reference.id)} /></div><div className="space-y-2"><label className="block"><span className="text-[10px] font-semibold text-slate-500">参考链接或出处（选填）</span><input value={reference.link} onChange={event => updateItem(selectedItem.id, item => ({ ...item, references: item.references.map(value => value.id === reference.id ? { ...value, link: event.target.value } : value) }))} maxLength={200} placeholder="粘贴商品、页面或案例链接" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-300" /></label><label className="block"><span className="text-[10px] font-semibold text-slate-500">想借鉴 / 需要避开</span><textarea value={reference.description} onChange={event => updateItem(selectedItem.id, item => ({ ...item, references: item.references.map(value => value.id === reference.id ? { ...value, description: event.target.value } : value) }))} maxLength={500} rows={3} placeholder="说明参考图中的构图、材质或排版取舍" className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-indigo-300" /></label></div></div></div>)}</div>
            </section>
          </div>}

          <section className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4"><label className="block"><span className="text-xs font-bold text-amber-900">本业务制作红线</span><span className="mt-1 block text-[11px] leading-5 text-amber-800/75">作为交付检查的提醒，发送前可按本次项目调整。</span><textarea value={redline} onChange={event => setRedline(event.target.value)} maxLength={800} rows={2} placeholder="填写需要避免的问题或必须遵循的规范" className="mt-3 w-full resize-y rounded-xl border border-amber-200 bg-white px-3.5 py-3 text-xs leading-5 text-slate-800 outline-none focus:border-amber-400" /></label></section>

          {legacySummary && <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-xs font-semibold text-slate-600">上一版卡片内容（保留在修订记录中）</summary><textarea value={legacySummary} onChange={event => setLegacySummary(event.target.value)} maxLength={800} rows={4} className="mt-3 w-full resize-y rounded-lg border border-slate-200 p-3 text-xs leading-5 outline-none focus:border-indigo-300" /></details>}

          <details className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 md:hidden"><summary className="cursor-pointer text-xs font-semibold text-indigo-800">查看发送预览</summary><div className="mt-3"><BusinessCardPreview definition={definition} title={title} items={items} redline={redline} /></div></details>
        </div></main>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-100 bg-slate-50/60 p-5 md:block"><div className="sticky top-0"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-bold text-slate-700">发送预览</h3><span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-600">所见即所得</span></div><BusinessCardPreview definition={definition} title={title} items={items} redline={redline} /><div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-700">发送前确认</p><p className="mt-1.5 text-[11px] leading-5 text-slate-500">确认每个子项的交付规格、原图和修改要点。聊天会保存本次卡片及附件，后续修订会另存版本。</p></div></div></aside>
      </div>}

      {chatPickerTarget && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setChatPickerTarget(null); }}><section role="dialog" aria-modal="true" aria-labelledby="business-chat-image-title" className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"><header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5"><div><h3 id="business-chat-image-title" className="text-sm font-bold text-slate-900">从聊天记录选择图片</h3><p className="mt-1 text-xs text-slate-500">已按图片去重，可选择多张；本张需求卡最多 {MAX_ATTACHMENTS} 张。</p></div><button type="button" aria-label="关闭图片选择" onClick={() => setChatPickerTarget(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><div className="flex min-h-0 flex-1 flex-col"><div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5"><label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={chatPickerSearch} onChange={event => { setChatPickerSearch(event.target.value); setChatPickerLimit(60); }} placeholder="按图片名称、发送人或说明搜索" className="min-w-0 flex-1 text-xs outline-none" /></label><span className="shrink-0 text-[11px] text-slate-500">已选 {chatPickerSelection.length} 张</span></div>{!chatImages.length ? <div className="flex min-h-48 flex-1 flex-col items-center justify-center px-6 text-center"><ImagePlus className="h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">当前会话没有可选图片</p><p className="mt-1 text-xs text-slate-400">聊天中发送的图片会出现在这里。</p></div> : !pickerImages.length ? <div className="flex min-h-48 flex-1 items-center justify-center px-6 text-center text-xs text-slate-400">{availableChatImageCount === 0 ? '会话图片已全部添加到这张需求卡。' : '没有匹配的图片。'}</div> : <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{pickerImages.slice(0, chatPickerLimit).map(image => { const selected = chatPickerSelection.includes(image.url); const atLimit = chatPickerSelection.length >= MAX_ATTACHMENTS - attachmentsTotal; return <button key={`${image.messageId}-${image.url}`} type="button" aria-pressed={selected} disabled={!selected && atLimit} onClick={() => setChatPickerSelection(current => selected ? current.filter(url => url !== image.url) : [...current, image.url])} className={`group overflow-hidden rounded-xl border text-left transition ${selected ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300'} disabled:cursor-not-allowed disabled:opacity-45`}><div className="relative"><AuthenticatedImage src={image.url} alt={image.name} className="aspect-square w-full bg-slate-100 object-cover" /><span className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-md border shadow-sm ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-white bg-white/90 text-transparent'}`}><Check className="h-3 w-3" /></span></div><span className="block truncate px-2 pt-2 text-[11px] font-medium text-slate-700">{image.name}</span><span className="block truncate px-2 pb-2 pt-0.5 text-[10px] text-slate-400">{image.senderName} · {chatTimeLabel(image.createdAt)} · {image.context}</span></button>; })}</div>{pickerImages.length > chatPickerLimit && <button type="button" onClick={() => setChatPickerLimit(value => value + 60)} className="mx-auto mt-4 block rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">再显示 60 张</button>}</div>}</div><footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-5"><span className="text-[11px] text-slate-500">本卡已添加 {attachmentsTotal}/{MAX_ATTACHMENTS} 张图片</span><div className="flex gap-2"><button type="button" onClick={() => setChatPickerTarget(null)} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600">取消</button><button type="button" onClick={confirmChatImages} disabled={!chatPickerSelection.length || attachmentsTotal >= MAX_ATTACHMENTS} className="min-h-10 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white disabled:opacity-40">添加所选图片</button></div></footer></section></div>}
      <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-white px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className={`min-h-5 text-xs ${error ? 'text-rose-600' : cardLength > 8000 ? 'text-rose-600' : 'text-slate-500'}`} role={error ? 'alert' : undefined}>{error || (step === 'configure' ? uploadProgress || `${completedItems}/${items.length} 个规格已填写 · 内容 ${cardLength.toLocaleString()}/8,000 字符` : '选中业务类型后，配置规格、素材和设计要点。')}</p><div className="flex shrink-0 gap-2">{step === 'configure' && !initial && <button type="button" onClick={() => { setStep('catalog'); setError(''); }} disabled={busy} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">返回选卡</button>}{step === 'configure' && <button type="button" onClick={() => void submit()} disabled={busy || !completedItems || completedItems !== items.length || !title.trim()} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">{sending ? '正在发送…' : revisionOf ? '发送修订版' : '确认并发送需求卡'}<ChevronRight className="h-4 w-4" /></button>}</div></footer>
    </section>
  </div>;
}

export function BusinessCardBoxTool({ onSend, messages = [] }: { onSend: SendCard; messages?: ChatHistoryMessage[] }) {
  const [open, setOpen] = useState(false);
  return <><ToolButton icon={Layers3} label="业务卡箱" description="选择设计业务，配置 SKU、素材和参考后发送" onClick={() => setOpen(true)} />{open && <BusinessCardBox onClose={() => setOpen(false)} onSend={onSend} messages={messages} />}</>;
}
