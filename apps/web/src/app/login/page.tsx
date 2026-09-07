'use client';

import React, { useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { useRouter, useSearchParams } from 'next/navigation';
import { Palette, Lock, Mail, User, ShieldCheck, ArrowRight, Sparkles, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { getRoleHome, setAuthSession } from '@/lib/auth';

const PRESET_ACCOUNTS = [
  { role: 'admin', name: '系统管理员', email: 'admin@cozi.com', tag: '全局配置/质检管理' },
  { role: 'customer_service', name: '王总监', email: 'reviewer@cozi.com', tag: '订单发布审核/纠纷处理' },
  { role: 'advertiser', name: '陈品牌经理', email: 'advertiser@cozi.com', tag: '发单/配置作品审核流' },
  { role: 'designer', name: '李设计师', email: 'designer@cozi.com', tag: '设计提审/历史版本' },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect');

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);

  // 登录表单
  const [email, setEmail] = useState('advertiser@cozi.com');
  const [password, setPassword] = useState('123456');

  // 注册表单
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<'designer' | 'advertiser'>('advertiser');
  const [regDept, setRegDept] = useState('视觉设计部');

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      toast.error('请填写邮箱与密码');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8080/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || '登录失败');
      }

      setAuthSession(data.data.token, data.data.user);
      toast.success(`欢迎回来，${data.data.user.name}`);
      router.push(redirectUrl || getRoleHome(data.data.user.role));
    } catch (err: any) {
      toast.error(err.message || '网络连接异常，请检查后端服务是否启动');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword) {
      toast.error('请完整填写注册信息');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8080/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          role: regRole,
          department: regDept,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || '注册失败');
      }

      setAuthSession(data.data.token, data.data.user);
      toast.success('注册成功并已自动登录');
      router.push(redirectUrl || getRoleHome(data.data.user.role));
    } catch (err: any) {
      toast.error(err.message || '注册发生错误');
    } finally {
      setLoading(false);
    }
  };

  const fillPreset = (item: (typeof PRESET_ACCOUNTS)[0]) => {
    setEmail(item.email);
    setPassword('123456');
    toast.info(`已载入预设账号: ${item.name}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 selection:bg-blue-500 selection:text-white">
      {/* 装饰光晕背景 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 glass-card overflow-hidden rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl bg-slate-900/60 text-white">
        {/* 左侧品牌与展示区 */}
        <div className="md:col-span-5 p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/10 bg-gradient-to-b from-blue-600/20 to-indigo-600/10">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Palette className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-white flex items-center gap-2">
                  Cozi Review
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-mono border border-blue-400/30">PRO</span>
                </h1>
                <p className="text-xs text-slate-400">电商设计稿审核管理系统</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              统一管理电商主图、详情页、海报等视觉资产。支持多级审核流程、精准图片坐标批注打标与全版本历史追溯。
            </p>

            <div className="space-y-2.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                快捷体验演示账号 (密码: 123456)
              </div>
              {PRESET_ACCOUNTS.map((preset) => (
                <button
                  key={preset.role}
                  type="button"
                  onClick={() => fillPreset(preset)}
                  className="w-full text-left p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-400/50 transition flex items-center justify-between group"
                >
                  <div>
                    <div className="text-xs font-semibold text-white group-hover:text-blue-300 transition">
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-slate-400">{preset.tag}</div>
                  </div>
                  <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                    一键填入
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 text-[11px] text-slate-500 flex items-center justify-between">
            <span>© 2026 Cozi Studio</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 企业安全鉴权</span>
          </div>
        </div>

        {/* 右侧表单操作区 */}
        <div className="md:col-span-7 p-8 flex flex-col justify-center">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-800/80 p-1 mb-6 rounded-2xl border border-white/10">
              <TabsTrigger value="login" className="rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                账号密码登录
              </TabsTrigger>
              <TabsTrigger value="register" className="rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                注册新成员
              </TabsTrigger>
            </TabsList>

            {/* 登录表单 */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">电子邮箱</Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="email"
                      required
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 bg-slate-800/60 border-white/10 text-white placeholder:text-slate-500 rounded-xl text-xs h-10 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-300">账户密码</Label>
                    <span className="text-[11px] text-blue-400 hover:underline cursor-pointer" onClick={() => toast.info('演示环境默认密码为 123456')}>
                      忘记密码？
                    </span>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="password"
                      required
                      placeholder="请输入密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 bg-slate-800/60 border-white/10 text-white placeholder:text-slate-500 rounded-xl text-xs h-10 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold h-10 rounded-xl shadow-lg shadow-blue-600/30 gap-2 mt-2"
                >
                  {loading ? '正在登录中...' : '立即登录'}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </form>
            </TabsContent>

            {/* 注册表单 */}
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-300">姓名</Label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        required
                        placeholder="张三"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="pl-9 bg-slate-800/60 border-white/10 text-white text-xs h-9 rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-300">所属角色</Label>
                    <Select.Root value={regRole} onValueChange={(value) => setRegRole(value as any)}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-xl border border-white/10 bg-slate-800/60 px-3 text-xs text-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-white/10 bg-slate-900 p-1 text-white shadow-md"><Select.Viewport><Select.Item value="advertiser" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-800"><Select.ItemText>品牌方 (发单与配置审核流)</Select.ItemText></Select.Item><Select.Item value="designer" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-800"><Select.ItemText>设计师 (接单与提交作品)</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">电子邮箱</Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="email"
                      required
                      placeholder="designer@company.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="pl-9 bg-slate-800/60 border-white/10 text-white text-xs h-9 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">设置密码 (至少6位)</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="password"
                      required
                      placeholder="设置安全密码"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="pl-9 bg-slate-800/60 border-white/10 text-white text-xs h-9 rounded-xl"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold h-10 rounded-xl shadow-lg shadow-blue-600/30 gap-2 mt-2"
                >
                  {loading ? '正在注册...' : '完成注册并登录'}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
