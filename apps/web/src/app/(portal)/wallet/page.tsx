'use client';

import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CreditCard, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  TrendingUp, 
  ShieldCheck, 
  FileText,
  Building2,
  Lock,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/use-current-user';
import type { DesignerWallet } from '@design-review/shared';

export default function DesignerWalletPage() {
  const user = useCurrentUser();
  const [wallet, setWallet] = useState<DesignerWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchWallet = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:8080/api/wallet/my-wallet?designerId=${user?.id || 'u_des_1'}`);
      const data = await res.json();
      if (data.success) {
        setWallet(data.data);
      }
    } catch (e) {
      toast.error('加载钱包资产失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, [user?.id]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      toast.error('请输入有效提现金额');
      return;
    }
    if (wallet && amount > wallet.availableBalance) {
      toast.error('提现金额超出可提现余额');
      return;
    }

    setWithdrawing(true);
    try {
      const res = await fetch('http://localhost:8080/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designerId: user?.id || 'u_des_1',
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '提现失败');
      }

      toast.success(data.message);
      setIsWithdrawOpen(false);
      setWithdrawAmount('');
      setWallet(data.data);
    } catch (err: any) {
      toast.error(err.message || '提现发生错误');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading || !wallet) {
    return <div className="p-12 text-center text-xs text-slate-400">正在同步钱包资产数据...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 顶部标题 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-3xl bg-white/70 border border-white/80 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Wallet className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              设计师个人收益与分账中心
            </h1>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[11px]">
              T+1 极速清算
            </Badge>
          </div>
        </div>

        <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold px-5 h-10 rounded-2xl shadow-md shadow-emerald-600/20 gap-1.5">
              <ArrowUpRight className="w-4 h-4" />
              申请提现至银行卡
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-white rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                收益提现申请
              </DialogTitle>
              <CardDescription className="text-xs text-slate-500">
                提现款项将原路结算转账至您绑定的实名银行卡
              </CardDescription>
            </DialogHeader>

            <form onSubmit={handleWithdraw} className="space-y-4 mt-2">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">当前可提现可用余额</span>
                <span className="font-extrabold text-slate-800 font-mono text-sm">
                  ¥{wallet.availableBalance.toFixed(2)}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">提现金额 (元) *</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="number"
                    required
                    min="1"
                    max={wallet.availableBalance}
                    placeholder="输入提现金额"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="pl-9 text-xs rounded-xl font-mono h-10"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-100 text-[11px] text-emerald-800 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  提现到账银行账户
                </div>
                <div className="text-emerald-900 font-mono font-medium">
                  {wallet.bankAccount?.bankName} ({wallet.bankAccount?.accountNo})
                </div>
              </div>

              <DialogFooter className="mt-4 gap-2">
                <Button type="button" variant="outline" onClick={() => setIsWithdrawOpen(false)} className="rounded-xl text-xs">
                  取消
                </Button>
                <Button type="submit" disabled={withdrawing} className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                  {withdrawing ? '提交中...' : '确认提现'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 4 大核心资金资产卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 可提现 */}
        <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>可提现余额</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-800 font-mono tracking-tight">
              ¥{wallet.availableBalance.toFixed(2)}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 资金已核验，随时可转出
            </div>
          </div>
        </Card>

        {/* 待结算 */}
        <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>质检中 / 待结算</span>
            <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-amber-600 font-mono tracking-tight">
              ¥{wallet.pendingSettlement.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              审核终审通过后自动划入余额
            </div>
          </div>
        </Card>

        {/* 累计总收入 */}
        <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>累计设计总创收</span>
            <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-800 font-mono tracking-tight">
              ¥{wallet.totalEarned.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              历史签约完结需求累计
            </div>
          </div>
        </Card>

        {/* 已提现 */}
        <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>已成功提现出账</span>
            <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-800 font-mono tracking-tight">
              ¥{wallet.withdrawnAmount.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              由托管存管银行直接发放
            </div>
          </div>
        </Card>
      </div>

      {/* 财务明细与流水列表 */}
      <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              资金流水与结算明细账单
            </div>
            <span className="text-[11px] font-normal text-slate-500">
              结算明细与资金流向实时同步
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {wallet.transactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">暂无资金交易流水</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {wallet.transactions.map((tx) => {
                const isIncome = tx.amount > 0;
                return (
                  <div key={tx.id} className="py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                        isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-slate-800 truncate">{tx.title}</span>
                          {tx.status === 'settled' && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.2 rounded-full font-medium">已入账</span>
                          )}
                          {tx.status === 'pending' && (
                            <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.2 rounded-full font-medium">审核托管中</span>
                          )}
                          {tx.status === 'processing' && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.2 rounded-full font-medium">银行处理中</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">{tx.description}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`text-sm font-extrabold font-mono ${isIncome ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {isIncome ? `+¥${tx.amount.toFixed(2)}` : `-¥${Math.abs(tx.amount).toFixed(2)}`}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
