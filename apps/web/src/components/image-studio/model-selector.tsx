'use client';

import { useState } from 'react';
import { Check, ChevronDown, Eye, ImagePlus, Loader2, SlidersHorizontal, TextCursorInput } from 'lucide-react';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { StudioModelProfile, StudioModelSelection } from '@/lib/image-studio-models';

const modelRoles = [
  { key: 'textProfileId', label: '方案与文案', description: '需求梳理、方案规划与文案创作', capabilities: ['text', 'vision'], icon: TextCursorInput, tone: 'bg-indigo-50 text-indigo-600' },
  { key: 'visionProfileId', label: '图片理解', description: '识别商品图片与参考素材', capabilities: ['vision'], icon: Eye, tone: 'bg-sky-50 text-sky-600' },
  { key: 'imageProfileId', label: '图片生成', description: '商品主图、场景图与套图制作', capabilities: ['image'], icon: ImagePlus, tone: 'bg-emerald-50 text-emerald-600' },
] as const;

type SelectorProps = {
  profiles: StudioModelProfile[]; value: StudioModelSelection; onChange: (value: StudioModelSelection) => void;
  disabled?: boolean; loading?: boolean; compact?: boolean; stacked?: boolean; collapsed?: boolean; toolbar?: boolean;
};

function ModelChoice({ role, profiles, selectedId, onChange, disabled, loading, compact }: {
  role: typeof modelRoles[number]; profiles: StudioModelProfile[]; selectedId: string; onChange: (id: string) => void;
  disabled?: boolean; loading?: boolean; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const available = profiles.filter((profile) => (role.capabilities as readonly string[]).includes(profile.capability));
  const selected = available.find((profile) => profile.id === selectedId);
  const missing = Boolean(selectedId && !selected);
  const unavailable = disabled || loading || !available.length;
  const Icon = role.icon;
  const title = loading ? '正在加载…' : selected?.name || (missing ? '原模型不可用' : available.length ? '选择模型' : '暂无可用模型');

  return <Popover open={open && !unavailable} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
    <PopoverTrigger asChild>
      <button type="button" role="combobox" aria-label={`${role.label}模型`} aria-expanded={open && !unavailable} aria-haspopup="listbox" disabled={unavailable} title={`${role.label} · ${title}${selected?.model && selected.model !== title ? ` · ${selected.model}` : ''}`} className={`group flex w-full min-w-0 items-center text-left outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'h-11 gap-2 rounded-xl border border-transparent bg-slate-50/80 px-2.5 hover:border-slate-200 hover:bg-white data-[state=open]:border-indigo-200 data-[state=open]:bg-white' : 'gap-3 rounded-2xl border bg-white p-3.5 hover:border-indigo-200 hover:shadow-sm data-[state=open]:border-indigo-300'} ${missing ? '!border-amber-300' : compact ? '' : 'border-slate-200'}`}>
        <span className={`grid shrink-0 place-items-center ${compact ? 'size-7 rounded-lg' : 'size-10 rounded-xl'} ${role.tone}`}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}</span>
        <span className="min-w-0 flex-1">
          <span className={`block font-medium text-slate-500 ${compact ? 'text-[10px] leading-4' : 'text-[11px]'}`}>{role.label}</span>
          <span className={`block truncate font-semibold ${compact ? 'text-xs leading-4' : 'mt-1 text-sm'} ${missing ? 'text-amber-700' : 'text-slate-800'}`}>{title}</span>
          {!compact && <span className="mt-1 block truncate text-[11px] font-normal text-slate-400">{missing ? '请选择其他可用模型' : selected?.model && selected.model !== selected.name ? selected.model : role.description}</span>}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-slate-400 transition group-data-[state=open]:rotate-180" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} collisionPadding={12} className="z-[160] w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border-slate-200 bg-white p-0 text-slate-800 shadow-xl outline-none">
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-3"><span className="text-xs font-semibold">选择{role.label}模型</span><span className="text-[11px] text-slate-400">{available.length} 个可用</span></div>
      <Command className="h-auto rounded-none bg-white text-slate-800">
        <CommandInput aria-label={`搜索${role.label}模型`} placeholder="搜索模型名称或 ID" value={query} onValueChange={setQuery} wrapperClassName="h-12 shrink-0 border-slate-100 px-3.5 focus-within:bg-slate-50 focus-within:ring-1 focus-within:ring-inset focus-within:ring-indigo-200" className="h-10 min-w-0 flex-1 rounded-none border-0 py-0 text-xs text-slate-800 shadow-none outline-none placeholder:text-slate-400 focus:border-0 focus:outline-none focus:ring-0" />
        <CommandList style={{ maxHeight: 'max(80px, min(280px, calc(var(--radix-popover-content-available-height) - 100px)))' }} className="overscroll-contain p-1.5">
          <CommandEmpty className="px-4 py-8 text-center text-xs text-slate-400">没有匹配的模型，换个关键词试试</CommandEmpty>
          {available.map((profile) => {
            const checked = profile.id === selectedId;
            return <CommandItem key={profile.id} value={profile.id} keywords={[profile.name, profile.model || '']} aria-label={`${profile.name}${profile.model && profile.model !== profile.name ? ` · ${profile.model}` : ''}`} onSelect={() => { if (!checked) onChange(profile.id); setOpen(false); setQuery(''); }} className={`min-h-14 cursor-pointer gap-3 rounded-xl px-2.5 py-2.5 outline-none data-[selected=true]:bg-slate-100 data-[selected=true]:text-slate-900 ${checked ? 'bg-indigo-50/60' : ''}`}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${role.tone}`}><Icon className="size-3.5" /></span>
              <span className="min-w-0 flex-1"><span className="block break-words text-xs font-medium text-slate-800">{profile.name}</span>{profile.model && profile.model !== profile.name && <span className="mt-0.5 block break-all text-[10px] text-slate-400">{profile.model}</span>}</span>
              {checked && <Check className="size-4 shrink-0 text-indigo-600" />}
            </CommandItem>;
          })}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}

export function ImageStudioModelSelector({ profiles, value, onChange, disabled, loading, compact = false, stacked = false, collapsed = false, toolbar = false }: SelectorProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [roleKey, setRoleKey] = useState<typeof modelRoles[number]['key']>('textProfileId');
  const [search, setSearch] = useState('');
  const choices = (small: boolean) => modelRoles.map((role) => <ModelChoice key={role.key} role={role} profiles={profiles} selectedId={value[role.key]} onChange={(id) => onChange({ ...value, [role.key]: id })} disabled={disabled} loading={loading} compact={small} />);
  if (toolbar) {
    const role = modelRoles.find((item) => item.key === roleKey)!;
    const available = profiles.filter((profile) => (role.capabilities as readonly string[]).includes(profile.capability));
    const Icon = role.icon;
    return <Popover open={toolbarOpen} onOpenChange={(open) => { setToolbarOpen(open); if (!open) setSearch(''); }}>
      <PopoverTrigger asChild><button type="button" aria-label="选择创作模型" disabled={disabled || loading} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px] text-slate-500 outline-none transition hover:bg-violet-50 hover:text-violet-600 focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="size-3.5 animate-spin" /> : <SlidersHorizontal className="size-3.5" />}创作模型<ChevronDown className="size-3" /></button></PopoverTrigger>
      <PopoverContent aria-label="创作模型选择" side="top" align="start" sideOffset={10} collisionPadding={12} className="z-[160] w-[min(340px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border-slate-200 bg-white p-0 text-slate-800 shadow-xl outline-none">
        <div className="px-3 pt-3"><p className="mb-2 text-xs font-semibold">创作模型</p><div role="tablist" aria-label="模型用途" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">{modelRoles.map((item) => <button type="button" key={item.key} role="tab" aria-selected={item.key === roleKey} onClick={() => { setRoleKey(item.key); setSearch(''); }} className={`h-8 rounded-md px-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${item.key === roleKey ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}</div></div>
        <Command key={roleKey} className="h-auto rounded-none bg-white text-slate-800">
          <CommandInput aria-label={`搜索${role.label}模型`} value={search} onValueChange={setSearch} placeholder="搜索模型名称或 ID" wrapperClassName="h-11 shrink-0 border-slate-100 px-3" className="h-9 min-w-0 border-0 py-0 text-xs shadow-none outline-none placeholder:text-slate-400 focus:outline-none focus:ring-0" />
          <CommandList style={{ maxHeight: 'max(80px, min(240px, calc(var(--radix-popover-content-available-height) - 140px)))' }} className="overscroll-contain p-1.5">
            <CommandEmpty className="px-4 py-6 text-center text-xs text-slate-400">{available.length ? '没有匹配的模型' : '暂无可用模型'}</CommandEmpty>
            {available.map((profile) => <CommandItem key={profile.id} value={profile.id} keywords={[profile.name, profile.model || '']} disabled={disabled || loading} onSelect={() => { if (profile.id !== value[role.key]) onChange({ ...value, [role.key]: profile.id }); setToolbarOpen(false); setSearch(''); }} className="min-h-12 cursor-pointer gap-2.5 rounded-xl px-2.5 py-2 outline-none data-[selected=true]:bg-violet-50 data-[selected=true]:text-slate-900"><span className={`grid size-7 shrink-0 place-items-center rounded-lg ${role.tone}`}><Icon className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="block break-words text-xs font-medium text-slate-800">{profile.name}</span>{profile.model && profile.model !== profile.name && <span className="mt-0.5 block break-all text-[10px] text-slate-400">{profile.model}</span>}</span>{profile.id === value[role.key] && <Check className="size-3.5 shrink-0 text-violet-600" />}</CommandItem>)}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>;
  }
  if (!compact) return <div className={`grid min-w-0 gap-3 ${stacked ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}>{choices(false)}</div>;

  const imageModel = profiles.find((profile) => profile.id === value.imageProfileId && profile.capability === 'image');
  return <>
    <div className={collapsed ? 'hidden' : 'hidden min-w-0 grid-cols-3 gap-2 sm:grid'}>{choices(true)}</div>
    <div className={collapsed ? '' : 'sm:hidden'}>
      <button type="button" aria-label="选择创作模型" aria-haspopup="dialog" onClick={() => setMobileOpen(true)} className="flex h-10 w-full min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs text-slate-700"><SlidersHorizontal className="size-4 shrink-0 text-indigo-600" /><span className="shrink-0 font-semibold">创作模型</span><span className="ml-auto min-w-0 truncate text-slate-500">{loading ? '正在加载…' : imageModel?.name || '选择模型'}</span><ChevronDown className="size-3.5 shrink-0 text-slate-400" /></button>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-3xl bg-white p-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl">
          <DialogHeader className="shrink-0 px-5 pb-4 pt-6 text-left"><DialogTitle className="text-base">创作模型</DialogTitle><DialogDescription className="text-xs">为方案、图片理解与生成选择模型。</DialogDescription></DialogHeader>
          <div className="grid max-h-[55dvh] min-h-0 flex-1 gap-3 overflow-y-auto px-5 pb-5">{choices(false)}</div>
          <DialogFooter className="shrink-0 border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><button type="button" onClick={() => setMobileOpen(false)} className="h-10 w-full rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700">完成</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </>;
}
