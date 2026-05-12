import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function POST(req: NextRequest): Promise<Response> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const res = await fetch(`${API_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeader,
    },
  });
  const setCookie = res.headers.get('set-cookie');

  // For form submissions (Cerrar sesión), redirect to /sign-in after.
  const accept = req.headers.get('accept') ?? '';
  if (accept.includes('text/html')) {
    const url = new URL('/sign-in', req.url);
    const redirect = NextResponse.redirect(url, { status: 303 });
    if (setCookie) redirect.headers.set('set-cookie', setCookie);
    return redirect;
  }

  const data = await res.text();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (setCookie) headers['set-cookie'] = setCookie;
  return new Response(data, { status: res.status, headers });
}
