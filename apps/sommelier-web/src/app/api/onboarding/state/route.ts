import type { NextRequest } from 'next/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function GET(req: NextRequest): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const cookieHeader = req.headers.get('cookie') ?? '';

  const res = await fetch(`${API_URL}/v1/onboarding/state`, {
    method: 'GET',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      cookie: cookieHeader,
    },
    cache: 'no-store',
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
