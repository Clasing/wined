import type { NextRequest } from 'next/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const cookieHeader = req.headers.get('cookie') ?? '';
  const { id } = await params;

  const res = await fetch(`${API_URL}/v1/sommelier/wine-lists/${id}/activate`, {
    method: 'POST',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      cookie: cookieHeader,
    },
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
