'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type CrossRow = {
  id: string;
  name: string;
  kind: string | null;
  active_wine_lists: number;
  total_wine_items: number;
};

export default function EstablishmentsPage() {
  const [rows, setRows] = useState<CrossRow[]>([]);

  useEffect(() => {
    apiFetch('/api/workspaces/cross-report')
      .then((r) => r.json())
      .then((d: { rows?: CrossRow[] }) => setRows(d.rows ?? []))
      .catch(() => setRows([]));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Establecimientos</h1>
      <p className="text-gray-600 mb-6">Reporte agregado de tus restaurantes / hoteles.</p>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-right px-4 py-3">Cartas activas</th>
              <th className="text-right px-4 py-3">Vinos en carta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-gray-500">{r.kind ?? '—'}</td>
                <td className="px-4 py-3 text-right">{r.active_wine_lists}</td>
                <td className="px-4 py-3 text-right">{r.total_wine_items}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
