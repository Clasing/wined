import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = [
  '/',
  '/sign-in',
  '/sign-up',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
];

export function middleware(req: NextRequest): NextResponse {
  const path = req.nextUrl.pathname;
  if (PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + '/'))) return NextResponse.next();
  if (path.startsWith('/_next') || path.startsWith('/api/')) return NextResponse.next();

  const hasSession = req.cookies.has('wined_refresh');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|.*\\.[\\w]+$).*)'],
};
