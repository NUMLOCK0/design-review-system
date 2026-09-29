import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const userAgent = request.headers.get('user-agent') || '';
  const isMobileDevice = request.headers.get('sec-ch-ua-mobile') === '?1' || /Android|iPhone|iPad|iPod|Mobile|IEMobile|Windows Phone|BlackBerry/i.test(userAgent);
  const mobileDestinations: Record<string, string> = {
    '/': '/mobile',
    '/order-market': '/mobile/orders',
    '/advertiser/dashboard': '/mobile',
    '/advertiser/orders': '/mobile/orders',
    '/review-tasks': '/mobile/tasks',
    '/wallet': '/mobile/profile',
    '/designer/profile': '/mobile/profile',
    '/messages': '/mobile/messages',
    '/evaluations': '/mobile/evaluations',
    '/service/evaluations': '/mobile/service/evaluations',
  };

  const mobileDestination = isMobileDevice && !pathname.startsWith('/mobile') ? mobileDestinations[pathname] || (pathname.startsWith('/evaluations/') ? `/mobile${pathname}` : undefined) : undefined;
  if (mobileDestination) {
    const destination = request.nextUrl.clone();
    destination.pathname = mobileDestination;
    const redirect = NextResponse.redirect(destination);
    redirect.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
    return redirect;
  }

  // 带哈希的静态资源可以长期缓存，页面与接口必须在每次部署后重新校验。
  if (
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, s-maxage=0, must-revalidate');
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
