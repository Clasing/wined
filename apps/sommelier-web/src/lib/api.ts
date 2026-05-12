// Client-side fetch wrapper that injects the access token from localStorage
// and transparently retries once after refreshing on 401.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('wined_access') : null;
  const baseHeaders: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) baseHeaders['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    ...init,
    headers: baseHeaders,
    credentials: 'include',
  });

  if (res.status === 401 && token) {
    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (r.ok) {
      const d = (await r.json().catch(() => ({}))) as { access_token?: string };
      if (d.access_token) {
        localStorage.setItem('wined_access', d.access_token);
        const retryHeaders: Record<string, string> = {
          ...((init.headers as Record<string, string> | undefined) ?? {}),
          Authorization: `Bearer ${d.access_token}`,
        };
        return fetch(path, { ...init, headers: retryHeaders, credentials: 'include' });
      }
    }
  }
  return res;
}
