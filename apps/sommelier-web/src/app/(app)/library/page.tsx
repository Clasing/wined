'use client';
import { useEffect, useState } from 'react';

type WineList = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  workspaceId?: string;
};

export default function LibraryPage() {
  const [lists, setLists] = useState<WineList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sommelier/wine-lists')
      .then((r) => r.json())
      .then((d) => {
        setLists(d.rows ?? []);
        setLoading(false);
      });
  }, []);

  async function activate(id: string) {
    await fetch(`/api/sommelier/wine-lists/${id}/activate`, { method: 'POST' });
    const r = await fetch('/api/sommelier/wine-lists').then((r) => r.json());
    setLists(r.rows ?? []);
  }

  if (loading) return <div>Cargando cartas…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Cartas de vinos</h1>
      <p className="text-gray-600 mb-6">
        Gestiona versiones de tu carta — la marcada como activa es la que usa el agente.
      </p>

      {lists.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-gray-500">
          Aún no has subido ninguna carta. Súbela desde el módulo de Ingestion.
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3">Carta</th>
                <th className="text-left px-4 py-3">Versión</th>
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lists.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{l.name}</td>
                  <td className="px-4 py-3">v{l.version}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(l.createdAt).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-4 py-3">
                    {l.isActive ? (
                      <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded text-xs">
                        ● Activa
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">Histórica</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!l.isActive && (
                      <button
                        onClick={() => activate(l.id)}
                        className="text-xs px-3 py-1 rounded bg-wined-500 text-white hover:bg-wined-700"
                      >
                        Activar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
