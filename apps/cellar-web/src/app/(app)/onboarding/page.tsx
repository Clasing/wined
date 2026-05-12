'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

const STEPS = [
  { id: 'signup_vertical', title: 'Bienvenido al cellar', desc: 'Vertical Cellar seleccionado.' },
  { id: 'business_type', title: 'Tipo', desc: 'Bodega / consultoría / investigación' },
  { id: 'do_region', title: 'DO o región principal', desc: 'Cargaremos el pliego al corpus' },
  {
    id: 'create_demo_lot',
    title: 'Crea un lote demo',
    desc: 'Variedad + depósito + fecha vendimia simulada',
  },
  {
    id: 'upload_doc_optional',
    title: 'Sube un documento técnico (opcional)',
    desc: 'Ficha de análisis, ficha técnica',
  },
  {
    id: 'first_technical_question',
    title: 'Tu primera pregunta técnica',
    desc: 'Ej: dosis SO₂ activo para 5 mg/L a pH 3.4',
  },
  {
    id: 'config_calendar',
    title: 'Calendario de operaciones',
    desc: 'Activa recordatorios de sulfitados, trasiegos, análisis',
  },
] as const;

const DOS = [
  { code: 'DO-RIOJA', name: 'Rioja' },
  { code: 'DO-RIBERA', name: 'Ribera del Duero' },
  { code: 'DO-CAVA', name: 'Cava' },
  { code: 'DO-RIAS-BAIXAS', name: 'Rías Baixas' },
  { code: 'DO-JEREZ', name: 'Jerez-Xérès-Sherry' },
];

export default function CellarOnboardingPage(): JSX.Element {
  const [stepIdx, setStepIdx] = useState(0);
  const [doSelected, setDoSelected] = useState('');
  const [techQuestionResponse, setTechQuestionResponse] = useState('');
  const current = STEPS[stepIdx];

  async function completeStep(): Promise<void> {
    if (!current) return;
    const data: Record<string, unknown> = {};
    if (current.id === 'do_region') data['do_code'] = doSelected;

    await apiFetch('/api/onboarding/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: 'cellar', step: current.id, data }),
    });

    if (stepIdx + 1 < STEPS.length) setStepIdx(stepIdx + 1);
    else await apiFetch('/api/onboarding/complete', { method: 'POST' });
  }

  async function askFirstQuestion(): Promise<void> {
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Calcula dosis de SO₂ para 5 mg/L libre a pH 3.4, alcohol 14%',
        agent: 'calc',
      }),
    });
    const text = await res.text();
    setTechQuestionResponse(text);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Bienvenido a Wined Cellar</h1>
      <p className="text-gray-600 mb-8">Configuremos tu bodega en menos de 15 minutos.</p>

      <div className="flex gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`h-2 flex-1 rounded-full ${
              i < stepIdx ? 'bg-cellar-500' : i === stepIdx ? 'bg-cellar-50' : 'bg-gray-200'
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

          {current.id === 'do_region' && (
            <select
              value={doSelected}
              onChange={(e) => setDoSelected(e.target.value)}
              className="border rounded-md px-3 py-2 mb-4 w-full"
            >
              <option value="">Selecciona una DO…</option>
              {DOS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          {current.id === 'first_technical_question' && (
            <div className="mb-4">
              <button
                onClick={askFirstQuestion}
                className="px-4 py-2 rounded-md bg-cellar-500 text-white hover:bg-cellar-700 mb-3"
              >
                Lanzar pregunta demo
              </button>
              {techQuestionResponse && (
                <pre className="text-sm bg-gray-50 p-3 rounded-md whitespace-pre-wrap">
                  {techQuestionResponse}
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
              className="px-6 py-2 rounded-md bg-cellar-500 text-white hover:bg-cellar-700"
            >
              {stepIdx + 1 === STEPS.length ? 'Finalizar' : 'Siguiente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
