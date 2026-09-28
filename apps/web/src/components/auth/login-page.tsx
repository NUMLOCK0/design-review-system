'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Layers3, Lock, Mail, PenTool, Phone, Route, ShieldCheck, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SmsSliderCaptcha } from '@/components/slider-captcha';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Modal, ModalContent, ModalHeader, ModalFooter } from '@/components/ui/modal';
import { AgreementModal } from '@/components/agreement-document';
import { AUTH_EXPIRED_NOTICE_KEY, getRoleHome, setAuthSession } from '@/lib/auth';
import { toast } from 'sonner';

const fieldClass = 'h-11 rounded-xl border-slate-200 bg-white/75 px-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-300';

function BrandMark({ className = '', designer = false, size = 48 }: { className?: string; designer?: boolean; size?: number }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl text-white shadow-lg transition-all duration-700 ${designer ? 'bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 shadow-rose-500/30' : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-400 shadow-blue-500/30'} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" className="fill-none" style={{ width: Math.round(size * 0.58), height: Math.round(size * 0.58) }} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M34 14.5A15 15 0 1 0 35 32" strokeWidth="4" /><path d="m23 27 7-7 7 7M30 20v14" strokeWidth="3.5" /></svg>
    </div>
  );
}

type LoginEntry = 'advertiser' | 'designer' | 'staff';

function LoginPageContent({ entryRole }: { entryRole: LoginEntry }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegister = searchParams.get('mode') === 'register' && entryRole !== 'staff';
  const isReset = searchParams.get('mode') === 'reset';
  const [loading, setLoading] = useState(false);
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);
  const [rememberAccount, setRememberAccount] = useState(false);
  const [loginMode, setLoginMode] = useState<'password' | 'sms'>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginSmsCode, setLoginSmsCode] = useState('');
  const [regName, setRegName] = useState('');
  const [regChannel, setRegChannel] = useState<'phone' | 'email'>('phone');
  const [regPhone, setRegPhone] = useState('');
  const [regSmsCode, setRegSmsCode] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regEmailCode, setRegEmailCode] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [captchaFor, setCaptchaFor] = useState<'login' | 'register' | 'reset' | null>(null);
  const [captchaChannel, setCaptchaChannel] = useState<'phone' | 'email'>('phone');
  const [resetChannel, setResetChannel] = useState<'phone' | 'email'>('phone');
  const [resetPhone, setResetPhone] = useState('');
  const [resetSmsCode, setResetSmsCode] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetEmailCode, setResetEmailCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [agreement, setAgreement] = useState<'user' | 'privacy' | null>(null);
  const isDesigner = entryRole === 'designer';
  const isStaff = entryRole === 'staff';
  const loginPath = `/login/${entryRole}`;
  const accentText = isDesigner ? 'text-rose-600' : 'text-blue-600';
  const accentLink = isDesigner ? 'text-rose-600 hover:text-fuchsia-700' : 'text-blue-600 hover:text-indigo-700';
  const inputTone = isDesigner ? 'focus-visible:border-rose-400 focus-visible:ring-rose-500/20' : 'focus-visible:border-blue-500 focus-visible:ring-blue-500/20';
  const primaryButton = isDesigner ? 'bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 shadow-rose-500/30 hover:from-orange-600 hover:via-rose-600 hover:to-fuchsia-700' : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 shadow-blue-500/30 hover:from-blue-700 hover:via-indigo-700 hover:to-cyan-600';
  const policyLink = (type: 'user' | 'privacy', label: string, className = `mx-1 ${accentText} hover:underline`) => <button type="button" onClick={() => setAgreement(type)} className={className}>{label}</button>;
  const navigateToRoleHome = (role: Parameters<typeof getRoleHome>[0]) => {
    const isMobile = window.matchMedia('(max-width: 767px)').matches || /Android|iPhone|iPad|iPod|Mobile|IEMobile|Windows Phone|BlackBerry/i.test(navigator.userAgent);
    const requested = searchParams.get('redirect');
    const requestedPath = requested?.split('?')[0] || '';
    const redirectMatchesRole = role === 'advertiser'
      ? requestedPath === '/advertiser' || requestedPath.startsWith('/advertiser/') || ['/mobile', '/mobile/orders', '/mobile/profile', '/mobile/orders/new'].includes(requestedPath)
      : role === 'designer'
        ? ['/order-market', '/review-tasks', '/review-submit', '/wallet', '/designer', '/mobile/orders', '/mobile/tasks', '/mobile/profile', '/mobile/designer-profile'].some((path) => requestedPath === path || requestedPath.startsWith(`${path}/`))
        : ['/admin', '/service', '/mobile/service'].some((path) => requestedPath === path || requestedPath.startsWith(`${path}/`));
    const safeRedirect = requested?.startsWith('/') && !requested.startsWith('//') && redirectMatchesRole ? requested : null;
    const destination = safeRedirect || (isMobile ? role === 'designer' ? '/mobile/orders' : role === 'advertiser' ? '/mobile' : getRoleHome(role) : getRoleHome(role));
    window.location.replace(destination);
  };

  useEffect(() => {
    if (!smsCountdown) return;
    const timer = window.setInterval(() => setSmsCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [smsCountdown]);

  useEffect(() => {
    setAgreedToPolicies(window.localStorage.getItem('login_policies_accepted') === 'true');
    const expiredNotice = window.sessionStorage.getItem(AUTH_EXPIRED_NOTICE_KEY);
    if (expiredNotice) {
      window.sessionStorage.removeItem(AUTH_EXPIRED_NOTICE_KEY);
      toast.error(expiredNotice);
    }
    const saved = window.localStorage.getItem('saved_login_account');
    if (!saved) return;
    try {
      const account = JSON.parse(saved) as { mode: 'password' | 'sms'; value: string };
      setRememberAccount(true);
      setLoginMode(account.mode);
      if (account.mode === 'password') setIdentifier(account.value);
      else setLoginPhone(account.value);
    } catch { window.localStorage.removeItem('saved_login_account'); }
  }, []);

  const validPhone = (value: string) => /^1[3-9]\d{9}$/.test(value.trim());
  const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const openCaptcha = (target: 'login' | 'register' | 'reset', channel: 'phone' | 'email' = 'phone') => {
    const value = target === 'login' ? loginPhone : target === 'register' ? (channel === 'phone' ? regPhone : regEmail) : (channel === 'phone' ? resetPhone : resetEmail);
    if (channel === 'phone' ? !validPhone(value) : !validEmail(value)) return toast.error(channel === 'phone' ? '请先输入有效的手机号' : '请先输入有效的邮箱');
    if (smsCountdown > 0) return;
    setCaptchaChannel(channel);
    setCaptchaFor(target);
  };

  const handleCaptchaVerified = async (target: 'login' | 'register' | 'reset', channel: 'phone' | 'email', captchaToken: string) => {
    const value = target === 'login' ? loginPhone : target === 'register' ? (channel === 'phone' ? regPhone : regEmail) : (channel === 'phone' ? resetPhone : resetEmail);
    try {
      const response = await fetch(`/api/auth/${channel === 'phone' ? 'sms' : 'email'}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [channel]: value, captchaToken, purpose: target, role: entryRole }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '短信发送失败');
      setSmsCountdown(60);
      setCaptchaFor(null);
      toast.success(`${channel === 'phone' ? '短信' : '邮箱'}验证码已发送`);
    } catch (error: any) {
      toast.error(error.message || '短信发送失败');
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loginMode === 'password' && (!identifier || !password)) return toast.error('请填写邮箱/手机号与密码');
    if (loginMode === 'sms' && (!validPhone(loginPhone) || !loginSmsCode)) return toast.error('请填写手机号与短信验证码');
    if (!agreedToPolicies) return toast.error('请先阅读并同意用户协议和隐私协议');
    setLoading(true);
    try {
      const endpoint = loginMode === 'sms' ? 'sms/login' : 'login';
      const body = loginMode === 'sms' ? { phone: loginPhone, code: loginSmsCode, role: entryRole } : { identifier, password, role: entryRole };
      const response = await fetch(`/api/auth/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '登录失败');
      const session = result.data;
      const targetRole = isStaff
        ? (session.user.role === 'admin' || session.user.role === 'customer_service' ? session.user.role : null)
        : entryRole;
      if (!targetRole || session.user.role !== targetRole) {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
        throw new Error(isStaff ? '该账号没有平台工作人员权限' : `该账号没有${isDesigner ? '设计师' : '品牌方'}权限，请使用对应账号或入口`);
      }
      setAuthSession(session.token, session.user);
      window.localStorage.setItem('login_policies_accepted', 'true');
      if (rememberAccount) window.localStorage.setItem('saved_login_account', JSON.stringify({ mode: loginMode, value: loginMode === 'password' ? identifier.trim() : loginPhone.trim() }));
      else window.localStorage.removeItem('saved_login_account');
      toast.success(`欢迎回来，${session.user.name}`);
      navigateToRoleHome(session.user.role);
    } catch (error: any) {
      toast.error(error.message || '网络连接异常，请检查后端服务是否启动');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isStaff) return toast.error('平台工作人员账号请联系管理员开通');
    const verificationCode = regChannel === 'phone' ? regSmsCode : regEmailCode;
    if (!regName || (regChannel === 'phone' ? !validPhone(regPhone) : !validEmail(regEmail)) || !verificationCode || !regPassword) return toast.error('请完整填写注册信息');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, channel: regChannel, phone: regChannel === 'phone' ? regPhone : undefined, email: regChannel === 'email' ? regEmail : undefined, code: verificationCode, password: regPassword, role: entryRole, department: entryRole === 'advertiser' ? '品牌与设计协作部' : '视觉设计部' }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '注册失败');
      setAuthSession(result.data.token, result.data.user);
      toast.success('注册成功并已自动登录');
      navigateToRoleHome(result.data.user.role);
    } catch (error: any) {
      toast.error(error.message || '注册发生错误');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const verificationCode = resetChannel === 'phone' ? resetSmsCode : resetEmailCode;
    if ((resetChannel === 'phone' ? !validPhone(resetPhone) : !validEmail(resetEmail)) || !verificationCode || !resetPassword) return toast.error('请完整填写找回密码信息');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: resetChannel, phone: resetChannel === 'phone' ? resetPhone : undefined, email: resetChannel === 'email' ? resetEmail : undefined, code: verificationCode, password: resetPassword, role: entryRole }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '密码重置失败');
      toast.success('密码重置成功，请使用新密码登录');
      router.push(loginPath);
    } catch (error: any) {
      toast.error(error.message || '密码重置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-role-theme={isDesigner ? 'designer' : undefined} className={`relative min-h-screen w-full max-w-full overflow-x-clip text-slate-900 transition-colors duration-700 ${isDesigner ? 'bg-[#fff7f5] selection:bg-rose-100 selection:text-rose-900' : 'bg-[#f5f7ff] selection:bg-blue-100 selection:text-blue-900'}`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`absolute -left-24 top-6 h-[28rem] w-[28rem] rounded-full bg-blue-400/35 blur-3xl transition-all duration-700 ease-out ${isDesigner ? 'translate-x-24 -translate-y-12 scale-75 opacity-0' : 'translate-x-0 translate-y-0 scale-100 opacity-100'}`} />
        <div className={`absolute -right-24 bottom-0 h-[30rem] w-[30rem] rounded-full bg-cyan-300/45 blur-3xl transition-all duration-700 ease-out ${isDesigner ? '-translate-x-24 translate-y-12 scale-75 opacity-0' : 'translate-x-0 translate-y-0 scale-100 opacity-100'}`} />
        <div className={`absolute -left-24 bottom-0 h-[30rem] w-[30rem] rounded-full bg-orange-300/45 blur-3xl transition-all duration-700 ease-out ${isDesigner ? 'translate-x-0 translate-y-0 scale-100 opacity-100' : '-translate-x-24 translate-y-12 scale-75 opacity-0'}`} />
        <div className={`absolute -right-28 top-0 h-[30rem] w-[30rem] rounded-full bg-fuchsia-300/40 blur-3xl transition-all duration-700 ease-out ${isDesigner ? 'translate-x-0 translate-y-0 scale-100 opacity-100' : 'translate-x-24 -translate-y-12 scale-75 opacity-0'}`} />
        <div className={`absolute inset-0 opacity-[0.34] transition-[background-image] duration-700 [background-size:44px_44px] ${isDesigner ? '[background-image:linear-gradient(rgba(225,29,72,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(225,29,72,.06)_1px,transparent_1px)]' : '[background-image:linear-gradient(rgba(37,99,235,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,.06)_1px,transparent_1px)]'}`} />
      </div>

      <main className="relative mx-auto grid min-h-screen w-full min-w-0 max-w-6xl items-center gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-20">
        <section className="hidden lg:block">
          <div className="flex items-center gap-3"><BrandMark designer={isDesigner} /><div><p className="text-lg font-bold tracking-tight text-slate-900">创赢</p><p className="text-xs text-slate-500">视觉协作工作台</p></div></div>
          <div className="mt-20 max-w-xl"><p className={`mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] transition-colors duration-700 ${accentText}`}><Sparkles className="h-4 w-4" />{isStaff ? 'Platform operations' : isDesigner ? 'Designer creative space' : 'Brand collaboration hub'}</p><h1 className="text-5xl font-bold leading-[1.14] tracking-tight text-slate-900">{isStaff ? <>让平台协作<br /><span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent">安全、有序、可控</span></> : isDesigner ? <>让灵感变成<br /><span className="bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 bg-clip-text text-transparent">有价值的作品</span></> : <>让每一笔设计需求<br /><span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent">清晰、可靠、可交付</span></>}</h1><p className="mt-6 max-w-lg text-sm leading-7 text-slate-600">{isStaff ? '客服与管理员通过统一工作台处理审核、运营和用户管理。' : isDesigner ? '发现适合你的设计订单，专注创作、提交审核，并获得清晰可见的收益。' : '发布设计需求、跟踪交付进度，并在一个工作空间里完成验收与协作。'}</p></div>
          <div className="mt-12 grid max-w-xl grid-cols-3 gap-3">
            {(isStaff ? [[ShieldCheck, '权限清晰', '按职责处理平台审核与运营'], [Route, '流程可追踪', '关键操作有记录、可追溯'], [Layers3, '数据受保护', '按岗位权限访问业务数据']] : isDesigner ? [[PenTool, '自由创作', '从接单到交付，专注你的专业能力'], [Route, '进度清晰', '每一步审核和修改都有记录'], [ShieldCheck, '权益保障', '作品、收益与原图分层保护']] : [[Layers3, '需求协作', '订单发布、交付与验收一体完成'], [Route, '进度清晰', '每一个协作节点都可追踪'], [ShieldCheck, '资产安全', '素材、作品与权限分层保护']]).map(([Icon, title, desc]) => { const FeatureIcon = Icon as typeof Layers3; return <div key={title as string} className={`rounded-2xl border bg-white/75 p-4 shadow-sm backdrop-blur transition-colors duration-700 ${isDesigner ? 'border-rose-100' : 'border-blue-100'}`}><FeatureIcon className={`h-4 w-4 transition-colors duration-700 ${accentText}`} /><p className="mt-3 text-xs font-semibold text-slate-800">{title as string}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{desc as string}</p></div>; })}
          </div>
          <p className="mt-16 text-[11px] text-slate-400">© 2026 创赢 · 安全登录，安心协作</p>
        </section>

        <section className={`mx-auto w-full min-w-0 max-w-md rounded-[30px] border border-white/80 bg-white/80 p-2 text-slate-900 shadow-2xl backdrop-blur-xl transition-all duration-700 ${isDesigner ? 'shadow-rose-900/15' : 'shadow-blue-900/15'}`}>
          <div className="relative min-w-0 overflow-hidden rounded-[24px] border border-white bg-white/90 p-4 sm:p-8">
            <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent transition-colors duration-700 ${accentText}`} />
            <div className="mb-6 flex items-center gap-3 lg:hidden"><BrandMark designer={isDesigner} size={40} className="rounded-xl" /><div><p className="font-bold text-slate-900">创赢</p><p className="text-[11px] text-slate-400">视觉协作工作台</p></div></div>
            <div className="mb-6"><p className={`text-xs font-semibold transition-colors duration-700 ${accentText}`}>{isRegister ? '加入创赢' : isReset ? '安全找回账号' : isStaff ? 'STAFF ACCESS' : isDesigner ? 'DESIGNER ACCESS' : 'BRAND ACCESS'}</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{isRegister ? '创建你的工作账号' : isReset ? '重置登录密码' : isStaff ? '登录平台工作台' : isDesigner ? '登录设计师空间' : '登录品牌方工作台'}</h2><p className="mt-2 text-xs leading-5 text-slate-400">{isRegister ? '支持手机号或邮箱验证码注册，账号将绑定当前入口对应的角色' : isReset ? '通过已绑定手机号或邮箱验证身份并设置新密码' : isStaff ? '客服与管理员请使用平台分配的工作账号' : isDesigner ? '浏览订单、接单创作并提交设计作品' : '发布设计需求、跟踪交付并完成验收'}</p></div>
            {isRegister ? <>
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label required className="text-xs text-slate-600">姓名</Label><div className="relative"><User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input required value={regName} onChange={(event) => setRegName(event.target.value)} placeholder="请输入姓名" className={fieldClass} /></div></div><div className="space-y-2"><Label className="text-xs text-slate-600">注册方式</Label><div className="grid h-11 grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setRegChannel('phone')} className={`rounded-lg text-[11px] transition ${regChannel === 'phone' ? `bg-white font-semibold ${accentText} shadow-sm` : 'text-slate-500'}`}>手机号</button><button type="button" onClick={() => setRegChannel('email')} className={`rounded-lg text-[11px] transition ${regChannel === 'email' ? `bg-white font-semibold ${accentText} shadow-sm` : 'text-slate-500'}`}>邮箱</button></div></div></div>
                {regChannel === 'phone' ? <><div className="space-y-2"><Label required className="text-xs text-slate-600">手机号</Label><div className="relative"><Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="tel" required value={regPhone} onChange={(event) => setRegPhone(event.target.value)} placeholder="请输入手机号" className={fieldClass} /></div></div><div className="space-y-2"><Label required className="text-xs text-slate-600">短信验证码</Label><div className="flex gap-2"><Input required inputMode="numeric" maxLength={6} value={regSmsCode} onChange={(event) => setRegSmsCode(event.target.value.replace(/\D/g, ''))} placeholder="6位验证码" className={`${fieldClass} flex-1 pl-4`} /><Button type="button" variant="outline" disabled={smsCountdown > 0} onClick={() => openCaptcha('register', 'phone')} className={`h-11 shrink-0 rounded-xl border-slate-200 px-3 text-xs ${accentLink}`}>{smsCountdown > 0 ? `${smsCountdown}s后重发` : '获取验证码'}</Button></div></div></> : <><div className="space-y-2"><Label required className="text-xs text-slate-600">邮箱</Label><div className="relative"><Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="email" required value={regEmail} onChange={(event) => setRegEmail(event.target.value)} placeholder="请输入邮箱地址" className={fieldClass} /></div></div><div className="space-y-2"><Label required className="text-xs text-slate-600">邮箱验证码</Label><div className="flex gap-2"><Input required inputMode="numeric" maxLength={6} value={regEmailCode} onChange={(event) => setRegEmailCode(event.target.value.replace(/\D/g, ''))} placeholder="6位验证码" className={`${fieldClass} flex-1 pl-4`} /><Button type="button" variant="outline" disabled={smsCountdown > 0} onClick={() => openCaptcha('register', 'email')} className={`h-11 shrink-0 rounded-xl border-slate-200 px-3 text-xs ${accentLink}`}>{smsCountdown > 0 ? `${smsCountdown}s后重发` : '获取验证码'}</Button></div></div></>}
                <div className="space-y-2"><Label required className="text-xs text-slate-600">设置密码</Label><div className="relative"><Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="password" required value={regPassword} onChange={(event) => setRegPassword(event.target.value)} placeholder="至少6位密码" className={fieldClass} /></div></div>
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />账号仅绑定当前入口对应的一个角色</p>
                <Button type="submit" disabled={loading} className={`h-11 w-full rounded-xl text-xs font-semibold text-white shadow-lg ${primaryButton}`}>{loading ? '正在创建账号...' : '创建账号并进入工作台'}<ArrowRight className="ml-1 h-4 w-4" /></Button>
                <p className="text-center text-xs text-slate-500">已有账号？<a href={`${loginPath}`} className={`font-medium hover:underline ${accentLink}`}>去登录</a></p>
                <p className="text-center text-[11px] leading-5 text-slate-400">注册即表示同意{policyLink('user', '用户协议')}和{policyLink('privacy', '隐私协议')}</p>
              </form>
            </> : isReset ? <>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setResetChannel('phone')} className={`h-8 rounded-lg text-xs transition ${resetChannel === 'phone' ? `bg-white font-semibold ${accentText} shadow-sm` : 'text-slate-500'}`}>手机号找回</button><button type="button" onClick={() => setResetChannel('email')} className={`h-8 rounded-lg text-xs transition ${resetChannel === 'email' ? `bg-white font-semibold ${accentText} shadow-sm` : 'text-slate-500'}`}>邮箱找回</button></div>
                {resetChannel === 'phone' ? <><div className="space-y-2"><Label required className="text-xs text-slate-600">已绑定手机号</Label><Input type="tel" required value={resetPhone} onChange={(event) => setResetPhone(event.target.value)} placeholder="请输入注册时绑定的手机号" className={fieldClass} /></div><div className="space-y-2"><Label required className="text-xs text-slate-600">短信验证码</Label><div className="flex gap-2"><Input required inputMode="numeric" maxLength={6} value={resetSmsCode} onChange={(event) => setResetSmsCode(event.target.value.replace(/\D/g, ''))} placeholder="6位验证码" className={`${fieldClass} flex-1 pl-4`} /><Button type="button" variant="outline" disabled={smsCountdown > 0} onClick={() => openCaptcha('reset', 'phone')} className={`h-11 shrink-0 rounded-xl border-slate-200 px-3 text-xs ${accentLink}`}>{smsCountdown > 0 ? `${smsCountdown}s后重发` : '获取验证码'}</Button></div></div></> : <><div className="space-y-2"><Label required className="text-xs text-slate-600">已绑定邮箱</Label><Input type="email" required value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder="请输入注册时绑定的邮箱" className={fieldClass} /></div><div className="space-y-2"><Label required className="text-xs text-slate-600">邮箱验证码</Label><div className="flex gap-2"><Input required inputMode="numeric" maxLength={6} value={resetEmailCode} onChange={(event) => setResetEmailCode(event.target.value.replace(/\D/g, ''))} placeholder="6位验证码" className={`${fieldClass} flex-1 pl-4`} /><Button type="button" variant="outline" disabled={smsCountdown > 0} onClick={() => openCaptcha('reset', 'email')} className={`h-11 shrink-0 rounded-xl border-slate-200 px-3 text-xs ${accentLink}`}>{smsCountdown > 0 ? `${smsCountdown}s后重发` : '获取验证码'}</Button></div></div></>}
                <div className="space-y-2"><Label required className="text-xs text-slate-600">新密码</Label><Input type="password" required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="至少6位密码" className={fieldClass} /></div>
                <Button type="submit" disabled={loading} className={`h-11 w-full rounded-xl text-xs font-semibold text-white shadow-lg ${primaryButton}`}>{loading ? '正在重置...' : '重置密码'}<ArrowRight className="ml-1 h-4 w-4" /></Button>
                <p className="text-center text-xs text-slate-500">想起密码了？<a href={`${loginPath}`} className={`font-medium hover:underline ${accentLink}`}>返回登录</a></p>
                <p className="text-center text-[11px] leading-5 text-slate-400">继续操作即表示同意{policyLink('user', '用户协议')}和{policyLink('privacy', '隐私协议')}</p>
              </form>
            </> : <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setLoginMode('password')} className={`h-8 rounded-lg text-xs transition ${loginMode === 'password' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>密码登录</button><button type="button" onClick={() => setLoginMode('sms')} className={`h-8 rounded-lg text-xs transition ${loginMode === 'sms' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>短信登录</button></div>
                 {loginMode === 'password' ? <><div className="space-y-2"><Label required className="text-xs text-slate-600">邮箱或手机号</Label><div className="relative"><Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="text" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@company.com / 13800000000" className={`${fieldClass} ${inputTone}`} /></div></div><div className="space-y-2"><div className="flex items-center justify-between"><Label required className="text-xs text-slate-600">账户密码</Label><button type="button" className={`text-[11px] hover:underline ${accentLink}`} onClick={() => router.push(`${loginPath}?mode=reset`)}>忘记密码？</button></div><div className="relative"><Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" className={`${fieldClass} ${inputTone}`} /></div></div></> : <><div className="space-y-2"><Label required className="text-xs text-slate-600">手机号</Label><div className="relative"><Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="tel" required value={loginPhone} onChange={(event) => setLoginPhone(event.target.value)} placeholder="请输入手机号" className={`${fieldClass} ${inputTone}`} /></div></div><div className="space-y-2"><Label required className="text-xs text-slate-600">短信验证码</Label><div className="flex gap-2"><Input required inputMode="numeric" maxLength={6} value={loginSmsCode} onChange={(event) => setLoginSmsCode(event.target.value.replace(/\D/g, ''))} placeholder="6位验证码" className={`${fieldClass} ${inputTone} flex-1 pl-4`} /><Button type="button" variant="outline" disabled={smsCountdown > 0} onClick={() => openCaptcha('login', 'phone')} className={`h-11 shrink-0 rounded-xl border-slate-200 px-3 text-xs ${accentLink}`}>{smsCountdown > 0 ? `${smsCountdown}s后重发` : '获取验证码'}</Button></div></div></>}
                <div className="flex items-center gap-2"><Checkbox id="remember-account" checked={rememberAccount} onCheckedChange={(checked) => setRememberAccount(checked === true)} /><Label htmlFor="remember-account" className="cursor-pointer text-[11px] font-normal text-slate-500">保存账号</Label></div>
                <div className="flex items-start gap-2"><Checkbox id="login-policies" checked={agreedToPolicies} onCheckedChange={(checked) => setAgreedToPolicies(checked === true)} className="mt-0.5" /><Label required htmlFor="login-policies" className="cursor-pointer text-[11px] font-normal leading-5 text-slate-500">我已阅读并同意{policyLink('user', '用户协议')}和{policyLink('privacy', '隐私协议')}</Label></div>
                <Button type="submit" disabled={loading} className={`h-11 w-full rounded-xl text-xs font-semibold text-white shadow-lg transition-all duration-500 hover:-translate-y-0.5 ${primaryButton}`}>{loading ? '正在登录...' : isStaff ? '进入平台工作台' : isDesigner ? '进入设计师空间' : '进入品牌方工作台'}<ArrowRight className="ml-1 h-4 w-4" /></Button>
                <p className="text-center text-xs text-slate-500">{!isStaff && <>没有账号？<a href={`${loginPath}?mode=register`} className={`font-medium hover:underline ${accentLink}`}>去注册</a></>}</p>
              </form>
            </>}
            <Modal open={captchaFor !== null} onOpenChange={(open) => { if (!open) setCaptchaFor(null); }}>
              <ModalContent className="w-[calc(100%-2rem)] max-w-[420px] rounded-2xl bg-white p-5">
                <ModalHeader>
                  <DialogTitle className="text-base text-slate-900">安全验证</DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">请完成滑块验证后获取{captchaChannel === 'phone' ? '短信' : '邮箱'}验证码</DialogDescription>
                </ModalHeader>
                {captchaFor && <SmsSliderCaptcha key={`${captchaFor}-${captchaChannel}`} onVerified={(token) => handleCaptchaVerified(captchaFor, captchaChannel, token)} />}
              </ModalContent>
            </Modal>
            <AgreementModal open={agreement !== null} onOpenChange={(open) => !open && setAgreement(null)} title={agreement === 'privacy' ? '隐私协议' : '用户协议'} contentKey={agreement === 'privacy' ? 'privacyPolicyContent' : 'userAgreementContent'} />
          </div>
        </section>
      </main>
    </div>
  );
}

export function LoginPage({ entryRole }: { entryRole: LoginEntry }) {
  return <Suspense fallback={<div className={`min-h-screen ${entryRole === 'designer' ? 'bg-[#fff7f5]' : 'bg-[#f5f7ff]'}`} />}><LoginPageContent entryRole={entryRole} /></Suspense>;
}
