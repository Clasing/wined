import type { NextRequest } from 'next/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function POST(req: NextRequest): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const cookieHeader = req.headers.get('cookie') ?? '';

  const res = await fetch(`${API_URL}/v1/onboarding/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
      cookie: cookieHeader,
    },
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
