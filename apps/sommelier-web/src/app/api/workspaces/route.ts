import { auth } from '@clerk/nextjs/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function GET(): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();

  const res = await fetch(`${API_URL}/v1/workspaces`, {
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

export async function POST(req: Request): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();
  const body = await req.text();

  const res = await fetch(`${API_URL}/v1/workspaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
