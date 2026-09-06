'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon, Download, Loader2 } from 'lucide-react';

export interface DateExportRange {
  startDate: string;
  endDate: string;
  preset?: string;
}

interface ExportDateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onConfirm: (range: DateExportRange) => Promise<void> | void;
}

// 格式化日期为 YYYY-MM-DD
function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 计算预设日期区间
function getPresetRange(preset: string): { start: string; end: string } {
  const today = new Date();
  const todayStr = formatDate(today);

  switch (preset) {
    case '今日':
      return { start: todayStr, end: todayStr };
    case '昨日': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = formatDate(yesterday);
      return { start: yStr, end: yStr };
    }
    case '过去 7 天': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start: formatDate(start), end: todayStr };
    }
    case '过去 15 天': {
      const start = new Date(today);
      start.setDate(start.getDate() - 14);
      return { start: formatDate(start), end: todayStr };
    }
    case '过去 30 天': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start: formatDate(start), end: todayStr };
    }
    case '上周': {
      // 周一到周日
      const d = new Date(today);
      const currentDay = d.getDay() === 0 ? 7 : d.getDay();
      // 上周日
      const lastSunday = new Date(d);
      lastSunday.setDate(d.getDate() - currentDay);
      // 上周一
      const lastMonday = new Date(lastSunday);
      lastMonday.setDate(lastSunday.getDate() - 6);
      return { start: formatDate(lastMonday), end: formatDate(lastSunday) };
    }
    case '本月': {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: formatDate(startOfMonth), end: todayStr };
    }
    case '上月': {
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: formatDate(startOfLastMonth), end: formatDate(endOfLastMonth) };
    }
    default:
      return { start: todayStr, end: todayStr };
  }
}

export function ExportDateModal({
  open,
  onOpenChange,
  title = '选择导出日期',
  onConfirm,
}: ExportDateModalProps) {
  const todayStr = formatDate(new Date());
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [selectedPreset, setSelectedPreset] = useState('今日');
  const [isExporting, setIsExporting] = useState(false);

  // 当弹窗打开时重置为今日
  React.useEffect(() => {
    if (open) {
      const current = formatDate(new Date());
      setStartDate(current);
      setEndDate(current);
      setSelectedPreset('今日');
      setIsExporting(false);
    }
  }, [open]);

  const handleSelectPreset = (preset: string) => {
    setSelectedPreset(preset);
    const range = getPresetRange(preset);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const handleDateInputChange = (type: 'start' | 'end', val: string) => {
    if (type === 'start') {
      setStartDate(val);
    } else {
      setEndDate(val);
    }
    setSelectedPreset(''); // 清空快捷高亮
  };

  const handleConfirm = async () => {
    setIsExporting(true);
    try {
      await onConfirm({
        startDate,
        endDate,
        preset: selectedPreset || undefined,
      });
      onOpenChange(false);
    } catch {
      // 错误由调用方处理
    } finally {
      setIsExporting(false);
    }
  };

  const presetColumns = [
    ['今日', '过去 7 天', '过去 15 天', '过去 30 天'],
    ['昨日', '上周', '本月', '上月'],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[340px] p-5 rounded-2xl sm:max-w-[340px] shadow-2xl border bg-background/95 backdrop-blur-md">
        <DialogHeader className="p-0 pb-3 border-b">
          <DialogTitle className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
            <Download className="size-4 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* 选择日期区间输入框 */}
          <div className="space-y-1.5">
            <div className="text-xs text-foreground font-medium">选择日期:</div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <div className="flex items-center h-8 px-2 rounded-lg bg-muted/60 hover:bg-muted border border-border/60 text-xs font-mono text-foreground gap-1.5 transition-colors">
                  <CalendarIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleDateInputChange('start', e.target.value)}
                    className="w-full bg-transparent border-0 p-0 text-xs focus:outline-none focus:ring-0 cursor-pointer font-mono"
                  />
                </div>
              </div>

              <span className="text-xs text-muted-foreground">-</span>

              <div className="relative flex-1">
                <div className="flex items-center h-8 px-2 rounded-lg bg-muted/60 hover:bg-muted border border-border/60 text-xs font-mono text-foreground gap-1.5 transition-colors">
                  <CalendarIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleDateInputChange('end', e.target.value)}
                    className="w-full bg-transparent border-0 p-0 text-xs focus:outline-none focus:ring-0 cursor-pointer font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 快捷日期列表 */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">快捷日期:</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {presetColumns[0].map((item, idx) => {
                const rightItem = presetColumns[1][idx];
                return (
                  <React.Fragment key={idx}>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(item)}
                      className={`text-left text-xs py-0.5 transition-colors ${
                        selectedPreset === item
                          ? 'text-primary font-semibold'
                          : 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
                      }`}
                    >
                      {item}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(rightItem)}
                      className={`text-left text-xs py-0.5 transition-colors ${
                        selectedPreset === rightItem
                          ? 'text-primary font-semibold'
                          : 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
                      }`}
                    >
                      {rightItem}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* 底部操作按钮 */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={isExporting}
              className="h-8 px-5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium shadow-xs"
            >
              {isExporting ? <Loader2 className="size-3.5 animate-spin" /> : '确定'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isExporting}
              className="h-8 px-5 rounded-full text-xs text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/80"
            >
              取消
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
