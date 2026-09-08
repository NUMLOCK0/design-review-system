'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Layers3, Lock, Mail, Phone, Route, ShieldCheck, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SmsSliderCaptcha } from '@/components/slider-captcha';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getRoleHome, setAuthSession } from '@/lib/auth';
import { toast } from 'sonner';

const fieldClass = 'h-11 rounded-xl border-slate-200 bg-slate-50 px-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-500/20';

function BrandMark({ className = 'h-12 w-12' }: { className?: string }) {
  return <div className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-lg shadow-blue-500/20 ${className}`} aria-hidden="true"><svg viewBox="0 0 48 48" className="h-7 w-7 fill-none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M34 14.5A15 15 0 1 0 35 32" strokeWidth="4" /><path d="m23 27 7-7 7 7M30 20v14" strokeWidth="3.5" /></svg></div>;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect');
  const isRegister = searchParams.get('mode') === 'register';
  const isReset = searchParams.get('mode') === 'reset';
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<'password' | 'sms'>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginSmsCode, setLoginSmsCode] = useState('');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regSmsCode, setRegSmsCode] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [captchaFor, setCaptchaFor] = useState<'login' | 'register' | 'reset' | null>(null);
  const [resetPhone, setResetPhone] = useState('');
  const [resetSmsCode, setResetSmsCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [smsCountdown, setSmsCountdown] = useState(0);

  useEffect(() => {
    if (!smsCountdown) return;
    const timer = window.setInterval(() => setSmsCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [smsCountdown]);

  const validPhone = (value: string) => /^1[3-9]\d{9}$/.test(value.trim());

  const openSmsCaptcha = (target: 'login' | 'register' | 'reset') => {
    const phone = target === 'login' ? loginPhone : target === 'register' ? regPhone : resetPhone;
    if (!validPhone(phone)) return toast.error('请先输入有效的手机号');
    if (smsCountdown > 0) return;
    setCaptchaFor(target);
  };

  const handleCaptchaVerified = async (target: 'login' | 'register' | 'reset', captchaToken: string) => {
    const phone = target === 'login' ? loginPhone : target === 'register' ? regPhone : resetPhone;
    try {
      const response = await fetch('http://localhost:8080/api/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, captchaToken, purpose: target }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '短信发送失败');
      setSmsCountdown(60);
      setCaptchaFor(null);
      toast.success('短信验证码已发送');
    } catch (error: any) {
      toast.error(error.message || '短信发送失败');
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loginMode === 'password' && (!identifier || !password)) return toast.error('请填写邮箱/手机号与密码');
    if (loginMode === 'sms' && (!validPhone(loginPhone) || !loginSmsCode)) return toast.error('请填写手机号与短信验证码');
    setLoading(true);
    try {
      const endpoint = loginMode === 'sms' ? 'sms/login' : 'login';
      const body = loginMode === 'sms' ? { phone: loginPhone, code: loginSmsCode } : { identifier, password };
      const response = await fetch(`http://localhost:8080/api/auth/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '登录失败');
      setAuthSession(result.data.token, result.data.user);
      toast.success(`欢迎回来，${result.data.user.name}`);
      router.push(redirectUrl || getRoleHome(result.data.user.role));
    } catch (error: any) {
      toast.error(error.message || '网络连接异常，请检查后端服务是否启动');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!regName || !validPhone(regPhone) || !regSmsCode || !regPassword) return toast.error('请完整填写注册信息');
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8080/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, phone: regPhone, smsCode: regSmsCode, password: regPassword, role: 'advertiser', department: '品牌与设计协作部' }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '注册失败');
      setAuthSession(result.data.token, result.data.user);
      toast.success('注册成功并已自动登录');
      router.push(redirectUrl || getRoleHome(result.data.user.role));
    } catch (error: any) {
      toast.error(error.message || '注册发生错误');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validPhone(resetPhone) || !resetSmsCode || !resetPassword) return toast.error('请完整填写找回密码信息');
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8080/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: resetPhone, smsCode: resetSmsCode, password: resetPassword }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '密码重置失败');
      toast.success('密码重置成功，请使用新密码登录');
      router.push('/login');
    } catch (error: any) {
      toast.error(error.message || '密码重置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6faff] text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-blue-200/60 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-cyan-200/60 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(37,99,235,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,.06)_1px,transparent_1px)] [background-size:44px_44px]" />
      </div>

      <main className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-20">
        <section className="hidden lg:block">
          <div className="flex items-center gap-3"><BrandMark /><div><p className="text-lg font-bold tracking-tight text-slate-900">创赢</p><p className="text-xs text-slate-500">视觉协作工作台</p></div></div>
          <div className="mt-20 max-w-xl"><p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-600"><Sparkles className="h-4 w-4" />Design operations workspace</p><h1 className="text-5xl font-bold leading-[1.14] tracking-tight text-slate-900">让每一笔设计需求<br /><span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">清晰、可靠、可交付</span></h1><p className="mt-6 max-w-lg text-sm leading-7 text-slate-600">从订单发布、设计交付到作品审核，在一个工作空间里完成协作。一个账号，同时拥有品牌方与设计师工作身份。</p></div>
          <div className="mt-12 grid max-w-xl grid-cols-3 gap-3">
            {[[Layers3, '双角色协作', '品牌方与设计师随时切换'], [Route, '流程可追踪', '节点进度清晰可见'], [ShieldCheck, '资产更安全', '原图与权限分层保护']].map(([Icon, title, desc]) => { const FeatureIcon = Icon as typeof Layers3; return <div key={title as string} className="rounded-2xl border border-blue-100 bg-white/75 p-4 shadow-sm backdrop-blur"><FeatureIcon className="h-4 w-4 text-blue-600" /><p className="mt-3 text-xs font-semibold text-slate-800">{title as string}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{desc as string}</p></div>; })}
          </div>
          <p className="mt-16 text-[11px] text-slate-400">© 2026 创赢 · 安全登录，安心协作</p>
        </section>

        <section className="mx-auto w-full max-w-md rounded-[28px] border border-white/80 bg-white/90 p-2 text-slate-900 shadow-2xl shadow-blue-900/10 backdrop-blur">
          <div className="rounded-[22px] border border-slate-100 bg-white p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3 lg:hidden"><BrandMark className="h-10 w-10 rounded-xl" /><div><p className="font-bold text-slate-900">创赢</p><p className="text-[11px] text-slate-400">视觉协作工作台</p></div></div>
            <div className="mb-6"><p className="text-xs font-semibold text-blue-600">{isRegister ? '加入创赢' : isReset ? '安全找回账号' : '欢迎回来'}</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{isRegister ? '创建你的工作账号' : isReset ? '重置登录密码' : '登录工作空间'}</h2><p className="mt-2 text-xs leading-5 text-slate-400">{isRegister ? '手机号注册后自动开通品牌方与设计师双角色' : isReset ? '通过已绑定手机号验证身份并设置新密码' : '使用账号密码或手机号验证码登录'}</p></div>
            {isRegister ? <>
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label className="text-xs text-slate-600">姓名</Label><div className="relative"><User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input required value={regName} onChange={(event) => setRegName(event.target.value)} placeholder="请输入姓名" className={fieldClass} /></div></div><div className="space-y-2"><Label className="text-xs text-slate-600">注册方式</Label><div className="flex h-11 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-xs font-medium text-blue-700"><Phone className="h-4 w-4" />手机号</div></div></div>
                <div className="space-y-2"><Label className="text-xs text-slate-600">手机号</Label><div className="relative"><Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="tel" required value={regPhone} onChange={(event) => setRegPhone(event.target.value)} placeholder="请输入手机号" className={fieldClass} /></div></div>
                <div className="space-y-2"><Label className="text-xs text-slate-600">短信验证码</Label><div className="flex gap-2"><Input required inputMode="numeric" maxLength={6} value={regSmsCode} onChange={(event) => setRegSmsCode(event.target.value.replace(/\D/g, ''))} placeholder="6位验证码" className={`${fieldClass} flex-1 pl-4`} /><Button type="button" variant="outline" disabled={smsCountdown > 0} onClick={() => openSmsCaptcha('register')} className="h-11 shrink-0 rounded-xl border-slate-200 px-3 text-xs text-blue-600">{smsCountdown > 0 ? `${smsCountdown}s后重发` : '获取验证码'}</Button></div></div>
                <div className="space-y-2"><Label className="text-xs text-slate-600">设置密码</Label><div className="relative"><Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="password" required value={regPassword} onChange={(event) => setRegPassword(event.target.value)} placeholder="至少6位密码" className={fieldClass} /></div></div>
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />注册后自动拥有品牌方与设计师双角色</p>
                <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-blue-600 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">{loading ? '正在创建账号...' : '创建账号并进入工作台'}<ArrowRight className="ml-1 h-4 w-4" /></Button>
                <p className="text-center text-xs text-slate-500">已有账号？<a href="/login" className="font-medium text-blue-600 hover:underline">去登录</a></p>
                <p className="text-center text-[11px] leading-5 text-slate-400">注册即表示同意<a href="/user-agreement" className="mx-1 text-blue-600 hover:underline">用户协议</a>和<a href="/privacy-policy" className="mx-1 text-blue-600 hover:underline">隐私协议</a></p>
              </form>
            </> : isReset ? <>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2"><Label className="text-xs text-slate-600">已绑定手机号</Label><Input type="tel" required value={resetPhone} onChange={(event) => setResetPhone(event.target.value)} placeholder="请输入注册时绑定的手机号" className={fieldClass} /></div>
                <div className="space-y-2"><Label className="text-xs text-slate-600">短信验证码</Label><div className="flex gap-2"><Input required inputMode="numeric" maxLength={6} value={resetSmsCode} onChange={(event) => setResetSmsCode(event.target.value.replace(/\D/g, ''))} placeholder="6位验证码" className={`${fieldClass} flex-1 pl-4`} /><Button type="button" variant="outline" disabled={smsCountdown > 0} onClick={() => openSmsCaptcha('reset')} className="h-11 shrink-0 rounded-xl border-slate-200 px-3 text-xs text-blue-600">{smsCountdown > 0 ? `${smsCountdown}s后重发` : '获取验证码'}</Button></div></div>
                <div className="space-y-2"><Label className="text-xs text-slate-600">新密码</Label><Input type="password" required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="至少6位密码" className={fieldClass} /></div>
                <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-blue-600 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">{loading ? '正在重置...' : '重置密码'}<ArrowRight className="ml-1 h-4 w-4" /></Button>
                <p className="text-center text-xs text-slate-500">想起密码了？<a href="/login" className="font-medium text-blue-600 hover:underline">返回登录</a></p>
                <p className="text-center text-[11px] leading-5 text-slate-400">继续操作即表示同意<a href="/user-agreement" className="mx-1 text-blue-600 hover:underline">用户协议</a>和<a href="/privacy-policy" className="mx-1 text-blue-600 hover:underline">隐私协议</a></p>
              </form>
            </> : <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setLoginMode('password')} className={`h-8 rounded-lg text-xs transition ${loginMode === 'password' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>密码登录</button><button type="button" onClick={() => setLoginMode('sms')} className={`h-8 rounded-lg text-xs transition ${loginMode === 'sms' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>短信登录</button></div>
                {loginMode === 'password' ? <><div className="space-y-2"><Label className="text-xs text-slate-600">邮箱或手机号</Label><div className="relative"><Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="text" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@company.com / 13800000000" className={fieldClass} /></div></div><div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-xs text-slate-600">账户密码</Label><button type="button" className="text-[11px] text-blue-600 hover:underline" onClick={() => router.push('/login?mode=reset')}>忘记密码？</button></div><div className="relative"><Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" className={fieldClass} /></div></div></> : <><div className="space-y-2"><Label className="text-xs text-slate-600">手机号</Label><div className="relative"><Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="tel" required value={loginPhone} onChange={(event) => setLoginPhone(event.target.value)} placeholder="请输入手机号" className={fieldClass} /></div></div><div className="space-y-2"><Label className="text-xs text-slate-600">短信验证码</Label><div className="flex gap-2"><Input required inputMode="numeric" maxLength={6} value={loginSmsCode} onChange={(event) => setLoginSmsCode(event.target.value.replace(/\D/g, ''))} placeholder="6位验证码" className={`${fieldClass} flex-1 pl-4`} /><Button type="button" variant="outline" disabled={smsCountdown > 0} onClick={() => openSmsCaptcha('login')} className="h-11 shrink-0 rounded-xl border-slate-200 px-3 text-xs text-blue-600">{smsCountdown > 0 ? `${smsCountdown}s后重发` : '获取验证码'}</Button></div></div></>}
                <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-blue-600 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">{loading ? '正在登录...' : '进入工作空间'}<ArrowRight className="ml-1 h-4 w-4" /></Button>
                <p className="text-center text-xs text-slate-500">没有账号？<a href="/login?mode=register" className="font-medium text-blue-600 hover:underline">去注册</a></p>
                <p className="text-center text-[11px] leading-5 text-slate-400">登录即表示同意<a href="/user-agreement" className="mx-1 text-blue-600 hover:underline">用户协议</a>和<a href="/privacy-policy" className="mx-1 text-blue-600 hover:underline">隐私协议</a></p>
              </form>
            </>}
            <Dialog open={captchaFor !== null} onOpenChange={(open) => { if (!open) setCaptchaFor(null); }}>
              <DialogContent className="w-[calc(100%-2rem)] max-w-[420px] rounded-2xl bg-white p-5">
                <DialogHeader>
                  <DialogTitle className="text-base text-slate-900">安全验证</DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">请完成滑块验证后获取短信验证码</DialogDescription>
                </DialogHeader>
                {captchaFor && <SmsSliderCaptcha key={captchaFor} onVerified={(token) => handleCaptchaVerified(captchaFor, token)} />}
              </DialogContent>
            </Dialog>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#f6faff]" />}><LoginPageContent /></Suspense>;
}
