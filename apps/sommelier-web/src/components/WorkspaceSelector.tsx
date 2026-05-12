'use client';
import { useEffect, useState } from 'react';

type Workspace = { id: string; name: string; kind?: string };

export function WorkspaceSelector({
  value,
  onChange,
}: {
  value?: string;
  onChange: (id: string) => void;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => r.json())
      .then((d: { rows?: Workspace[] }) => setWorkspaces(d.rows ?? []))
      .catch(() => setWorkspaces([]));
  }, []);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded-md px-3 py-2 text-sm"
    >
      <option value="">Todos los establecimientos</option>
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
          {w.kind ? ` (${w.kind})` : ''}
        </option>
      ))}
    </select>
  );
}
