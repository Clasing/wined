import { auth } from '@clerk/nextjs/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function GET(): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();

  const res = await fetch(`${API_URL}/v1/sommelier/wine-lists`, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
