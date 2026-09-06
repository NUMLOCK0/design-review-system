'use client';

import React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DateFilterType = 'today' | 'yesterday' | '7days' | '15days' | 'custom';

export interface DateRangeValue {
  start: string;
  end: string;
}

interface DateFilterTabsProps {
  value: DateFilterType;
  onChange: (type: DateFilterType, range: DateRangeValue) => void;
  customRange?: DateRangeValue;
  onCustomRangeChange?: (range: DateRangeValue) => void;
  className?: string;
  showCustomInputs?: boolean;
}

export function DateFilterTabs({
  value,
  onChange,
  customRange = {
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  },
  onCustomRangeChange,
  className,
  showCustomInputs = true,
}: DateFilterTabsProps) {
  const getComputedRange = (type: DateFilterType): DateRangeValue => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (type === 'today') {
      const todayStr = formatDate(today);
      return { start: todayStr, end: todayStr };
    }
    if (type === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = formatDate(y);
      return { start: yStr, end: yStr };
    }
    if (type === '7days') {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return { start: formatDate(start), end: formatDate(today) };
    }
    if (type === '15days') {
      const start = new Date();
      start.setDate(start.getDate() - 14);
      return { start: formatDate(start), end: formatDate(today) };
    }
    return customRange;
  };

  const handleSelect = (type: DateFilterType) => {
    const range = getComputedRange(type);
    onChange(type, range);
  };

  const options: Array<{ label: string; key: DateFilterType }> = [
    { label: '今日', key: 'today' },
    { label: '昨日', key: 'yesterday' },
    { label: '过去 7 天', key: '7days' },
    { label: '过去 15 天', key: '15days' },
    { label: '自定义', key: 'custom' },
  ];

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex items-center gap-2">
        {options.map((opt) => {
          const isActive = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleSelect(opt.key)}
              className={cn(
                'h-7 px-3 text-xs rounded-[8px] font-normal transition-all duration-150 cursor-pointer select-none flex items-center justify-center',
                isActive
                  ? 'bg-[#EEF2FF] text-[#3B82F6] border border-[#93C5FD] shadow-none font-medium'
                  : 'bg-[#F1F5F9]/90 text-[#475569] hover:bg-[#E2E8F0] hover:text-[#1E293B] border border-transparent'
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {value === 'custom' && showCustomInputs && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[8px] bg-[#F8FAFC] border border-[#CBD5E1] shadow-xs animate-in fade-in duration-150">
          <CalendarIcon className="size-3 text-[#3B82F6]" />
          <input
            type="date"
            value={customRange.start}
            onChange={(e) => {
              const newRange = { ...customRange, start: e.target.value };
              onCustomRangeChange?.(newRange);
              onChange('custom', newRange);
            }}
            className="h-6 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 outline-none focus:border-blue-500"
          />
          <span className="text-xs text-slate-400">至</span>
          <input
            type="date"
            value={customRange.end}
            onChange={(e) => {
              const newRange = { ...customRange, end: e.target.value };
              onCustomRangeChange?.(newRange);
              onChange('custom', newRange);
            }}
            className="h-6 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 outline-none focus:border-blue-500"
          />
        </div>
      )}
    </div>
  );
}
