import type { NextRequest } from 'next/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.text();
  const res = await fetch(`${API_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.text();
  const setCookie = res.headers.get('set-cookie');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (setCookie) headers['set-cookie'] = setCookie;
  return new Response(data, { status: res.status, headers });
}
