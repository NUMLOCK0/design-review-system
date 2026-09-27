import { NotFoundActions } from '@/components/not-found-actions';

export default function NotFound() {
  return <main className="grid min-h-[70vh] place-items-center bg-slate-50 px-4 py-16">
    <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
      <p className="text-sm font-bold tracking-[0.2em] role-primary-text">404</p>
      <h1 className="mt-3 text-2xl font-extrabold text-slate-900">页面不存在或无权访问</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">检查一下链接，或者返回其他页面继续使用。</p>
      <NotFoundActions />
    </div>
  </main>;
}
