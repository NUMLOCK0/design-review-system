'use client';

import { useEffect, useState } from 'react';
import { CircleDollarSign, RefreshCw, Search, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { fetchWithAuth } from '@/lib/auth';
import { toast } from 'sonner';

type PaymentRecord = {
  id: string;
  orderNo: string;
  orderTitle: string;
  creatorName: string;
  stage: 'deposit' | 'balance';
  stageLabel: string;
  outTradeNo: string;
  tradeNo: string;
  amount: number;
  status: 'paid' | 'pending';
  statusLabel: string;
  paidAt?: string;
  createdAt: string;
};

const formatMoney = (value: number) => `¥${value.toFixed(2)}`;

export default function AdminFinancePage() {
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [stage, setStage] = useState('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ totalAmount: 0, paidAmount: 0, pendingAmount: 0 });
  const pageSize = 10;

  const loadRecords = async (nextPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ keyword, status, stage, page: String(nextPage), pageSize: String(pageSize) });
      const response = await fetchWithAuth(`/payments/admin/orders?${params}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载财务记录失败');
      setRecords(result.data || []);
      setTotal(Number(result.total) || 0);
      setSummary(result.summary || { totalAmount: 0, paidAmount: 0, pendingAmount: 0 });
      setPage(nextPage);
    } catch (error: any) {
      toast.error(error.message || '加载财务记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); void loadRecords(1); }, [keyword, status, stage]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 sm:space-y-5 sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-md md:flex-row md:items-center">
        <div className="flex items-center gap-3"><div className="role-primary-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-md"><WalletCards className="h-5 w-5" /></div><div><h1 className="text-xl font-bold tracking-tight text-slate-800">财务管理</h1><p className="mt-1 text-xs text-slate-500">查看平台全部用户的定金、尾款支付订单信息</p></div></div>
        <Button variant="outline" onClick={() => void loadRecords(page)} disabled={loading} className="h-9 rounded-xl text-xs"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新记录</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3"><Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-4"><p className="text-xs text-slate-500">记录总额</p><p className="mt-2 text-xl font-bold text-slate-900">{formatMoney(summary.totalAmount)}</p></CardContent></Card><Card className="rounded-2xl border-0 bg-emerald-50 shadow-sm"><CardContent className="p-4"><p className="text-xs text-emerald-700">已支付金额</p><p className="mt-2 text-xl font-bold text-emerald-800">{formatMoney(summary.paidAmount)}</p></CardContent></Card><Card className="rounded-2xl border-0 bg-amber-50 shadow-sm"><CardContent className="p-4"><p className="text-xs text-amber-700">待支付金额</p><p className="mt-2 text-xl font-bold text-amber-800">{formatMoney(summary.pendingAmount)}</p></CardContent></Card></div>

      <Card className="rounded-3xl border border-white/80 bg-white/75 shadow-sm backdrop-blur-sm">
        <CardHeader className="space-y-4 pb-3"><div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{[['all', '全部状态'], ['paid', '支付成功'], ['pending', '待支付']].map(([value, label]) => <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-lg px-3 py-1.5 text-xs transition ${status === value ? 'bg-white font-semibold role-primary-text shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div><div className="flex flex-wrap items-center gap-2"><div className="flex gap-1 rounded-xl bg-slate-100 p-1">{[['all', '全部类型'], ['deposit', '定金'], ['balance', '尾款']].map(([value, label]) => <button key={value} type="button" onClick={() => setStage(value)} className={`rounded-lg px-3 py-1.5 text-xs transition ${stage === value ? 'bg-white font-semibold role-primary-text shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div><form className="flex min-w-0 flex-1 gap-2 sm:ml-auto sm:max-w-md" onSubmit={(event) => { event.preventDefault(); setKeyword(keywordInput.trim()); }}><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="搜索订单号、订单名称、用户或交易号" className="h-9 rounded-xl pl-9 text-xs" /></div><Button type="submit" className="h-9 shrink-0 rounded-xl px-3 text-xs">搜索</Button></form></div></CardHeader>
        <CardContent className="p-0">{loading ? <div className="p-12 text-center text-xs text-slate-400">正在加载财务记录…</div> : records.length === 0 ? <div className="p-12 text-center text-xs text-slate-400">暂无支付订单记录</div> : <><div className="hidden grid-cols-[1.2fr_1.5fr_.8fr_.8fr_1.2fr_1.2fr] gap-4 border-y border-slate-100 bg-slate-50/70 px-6 py-3 text-[11px] font-semibold text-slate-400 md:grid"><span>用户</span><span>订单</span><span>支付类型</span><span>金额</span><span>商户订单号</span><span>支付时间</span></div><div className="divide-y divide-slate-100">{records.map((record) => <div key={record.id} className="grid gap-3 px-6 py-4 md:grid-cols-[1.2fr_1.5fr_.8fr_.8fr_1.2fr_1.2fr] md:items-center md:gap-4"><div><p className="text-xs font-semibold text-slate-800">{record.creatorName}</p><p className="mt-1 text-[10px] text-slate-400">{record.orderNo}</p></div><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-700">{record.orderTitle}</p><p className="mt-1 text-[10px] text-slate-400">支付单：{record.tradeNo || record.outTradeNo || '未生成'}</p></div><Badge variant="outline" className={record.stage === 'deposit' ? 'w-fit border-orange-200 bg-orange-50 text-orange-700' : 'w-fit border-indigo-200 bg-indigo-50 text-indigo-700'}>{record.stageLabel}</Badge><div><p className="text-sm font-bold text-slate-800">{formatMoney(record.amount)}</p><Badge className={`mt-1 text-[10px] text-white ${record.status === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`}>{record.statusLabel}</Badge></div><p className="break-all text-[10px] text-slate-500">{record.outTradeNo || '—'}</p><p className="text-[10px] text-slate-400">{record.paidAt ? new Date(record.paidAt).toLocaleString('zh-CN') : '—'}</p></div>)}</div><AdminPagination page={page} pageSize={pageSize} total={total} onPageChange={(nextPage) => void loadRecords(nextPage)} /></>}</CardContent>
      </Card>
    </div>
  );
}
