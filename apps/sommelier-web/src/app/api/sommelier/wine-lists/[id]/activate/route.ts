import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_URL = process.env['WINED_API_URL'] ?? 'http://localhost:8787';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();
  const { id } = await params;

  const res = await fetch(`${API_URL}/v1/sommelier/wine-lists/${id}/activate`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
