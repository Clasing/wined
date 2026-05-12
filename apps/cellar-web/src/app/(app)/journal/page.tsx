'use client';
import { useEffect, useState } from 'react';

type LotOp = {
  id: string;
  opType: string;
  performedAt: string;
  notes?: string | null;
  inputs?: Record<string, unknown> | null;
};

type Lot = {
  id: string;
  code?: string;
  status?: string;
};

export default function JournalPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<string | null>(null);
  const [ops, setOps] = useState<LotOp[]>([]);

  useEffect(() => {
    fetch('/api/cellar/lots')
      .then((r) => r.json())
      .then((d: { rows?: Lot[] }) => {
        const rows = d.rows ?? [];
        setLots(rows);
        if (rows[0]) setSelectedLot(rows[0].id);
      })
      .catch(() => setLots([]));
  }, []);

  useEffect(() => {
    if (!selectedLot) return;
    fetch(`/api/cellar/lots/${selectedLot}/operations`)
      .then((r) => r.json())
      .then((d: { rows?: LotOp[] }) => setOps(d.rows ?? []))
      .catch(() => setOps([]));
  }, [selectedLot]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Diario de vinificación</h1>

      <div className="grid grid-cols-[260px_1fr] gap-6">
        <aside>
          <h2 className="font-semibold mb-3">Lotes</h2>
          {lots.length === 0 ? (
            <p className="text-sm text-gray-500">Sin lotes.</p>
          ) : (
            <ul className="space-y-1">
              {lots.map((l) => {
                const active = selectedLot === l.id;
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => setSelectedLot(l.id)}
                      className={`w-full text-left px-3 py-2 rounded ${
                        active
                          ? 'bg-cellar-50 text-cellar-700 font-medium'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div>{l.code ?? l.id.slice(0, 8)}</div>
                      <div className="text-xs text-gray-500">
                        {l.status ?? '—'}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section>
          {!selectedLot ? (
            <div className="text-gray-500">Selecciona un lote</div>
          ) : ops.length === 0 ? (
            <div className="text-gray-500">Sin operaciones registradas.</div>
          ) : (
            <div className="relative pl-8 before:absolute before:left-3 before:top-0 before:bottom-0 before:w-0.5 before:bg-cellar-200">
              {ops.map((op) => (
                <div key={op.id} className="relative mb-6">
                  <div className="absolute left-[-1.4rem] top-1 w-3 h-3 rounded-full bg-cellar-500" />
                  <div className="text-xs text-gray-500 mb-1">
                    {new Date(op.performedAt).toLocaleString('es-ES')}
                  </div>
                  <div className="font-semibold capitalize">
                    {op.opType.replace(/_/g, ' ')}
                  </div>
                  {op.notes && (
                    <p className="text-sm mt-1 text-gray-700">{op.notes}</p>
                  )}
                  {op.inputs && Object.keys(op.inputs).length > 0 && (
                    <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(op.inputs, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
