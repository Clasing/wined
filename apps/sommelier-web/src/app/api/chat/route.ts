import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function POST(req: NextRequest): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();
  const body = await req.text();

  const res = await fetch(`${API_URL}/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
