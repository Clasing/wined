'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

const STEPS = [
  {
    id: 'signup_vertical',
    title: 'Vertical distribuidor',
    desc: 'Vamos a configurar tu portfolio.',
  },
  { id: 'upload_catalog', title: 'Sube tu catálogo masivo', desc: 'Excel/CSV con tus referencias' },
  {
    id: 'map_columns',
    title: 'Mapea las columnas',
    desc: 'Productor, nombre, añada, DO, precio, stock',
  },
  {
    id: 'try_nl_search',
    title: 'Prueba la búsqueda NL',
    desc: '"blancos atlánticos < 30€ en stock"',
  },
  {
    id: 'gen_demo_sheet',
    title: 'Genera tu primera ficha comercial',
    desc: 'Para un cliente HoReCa de demo',
  },
  { id: 'invite_sales_team', title: 'Invita a tu equipo comercial', desc: 'Opcional' },
] as const;

export default function DistributorOnboardingPage(): JSX.Element {
  const [stepIdx, setStepIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('blancos atlánticos < 30€ en stock');
  const [searchResults, setSearchResults] = useState<string>('');
  const current = STEPS[stepIdx];

  async function completeStep(): Promise<void> {
    if (!current) return;
    await apiFetch('/api/onboarding/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: 'distributor', step: current.id }),
    });
    if (stepIdx + 1 < STEPS.length) setStepIdx(stepIdx + 1);
    else await apiFetch('/api/onboarding/complete', { method: 'POST' });
  }

  async function tryNlSearch(): Promise<void> {
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: searchQuery, agent: 'catalog-nl' }),
    });
    setSearchResults(await res.text());
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Bienvenido a Wined Distribuidor</h1>
      <p className="text-gray-600 mb-8">Tu catálogo navegable en menos de 30 minutos.</p>

      <div className="flex gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`h-2 flex-1 rounded-full ${
              i < stepIdx
                ? 'bg-distributor-500'
                : i === stepIdx
                  ? 'bg-distributor-200'
                  : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {current && (
        <div className="rounded-lg border p-8">
          <div className="text-sm text-gray-500 mb-2">
            Paso {stepIdx + 1} de {STEPS.length}
          </div>
          <h2 className="text-2xl font-semibold mb-3">{current.title}</h2>
          <p className="text-gray-600 mb-6">{current.desc}</p>

          {current.id === 'try_nl_search' && (
            <div className="mb-4">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border rounded-md px-3 py-2 w-full mb-3"
              />
              <button
                onClick={tryNlSearch}
                className="px-4 py-2 rounded-md bg-distributor-500 text-white hover:bg-distributor-700 mb-3"
              >
                Buscar
              </button>
              {searchResults && (
                <pre className="text-sm bg-gray-50 p-3 rounded-md whitespace-pre-wrap">
                  {searchResults}
                </pre>
              )}
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
              disabled={stepIdx === 0}
              className="px-4 py-2 text-gray-600 disabled:opacity-50"
            >
              Atrás
            </button>
            <button
              onClick={completeStep}
              className="px-6 py-2 rounded-md bg-distributor-500 text-white hover:bg-distributor-700"
            >
              {stepIdx + 1 === STEPS.length ? 'Finalizar' : 'Siguiente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
