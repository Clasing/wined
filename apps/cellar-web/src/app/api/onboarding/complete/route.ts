import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function POST(_req: NextRequest): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();

  const res = await fetch(`${API_URL}/v1/onboarding/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ product: 'cellar' }),
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
