'use client';
import { useState, useEffect } from 'react';

type StepDef = {
  readonly id: string;
  readonly title: string;
  readonly desc: string;
};

const STEPS: readonly StepDef[] = [
  {
    id: 'signup_vertical',
    title: 'Selecciona tu vertical',
    desc: 'Sommelier seleccionado — gestiona sala, cartas y maridajes.',
  },
  {
    id: 'business_type',
    title: 'Tipo de negocio',
    desc: 'Restaurante, hotel o distribuidor con servicio de sala.',
  },
  {
    id: 'upload_wine_list',
    title: 'Sube tu carta',
    desc: 'PDF o Excel — o usa una demo si aún no la tienes a mano.',
  },
  {
    id: 'review_extraction',
    title: 'Revisa extracción',
    desc: 'Tabla de vinos parseada — corrige lo que haga falta.',
  },
  {
    id: 'config_quick',
    title: 'Configuración rápida',
    desc: 'Idiomas, moneda y modo de servicio (formal, casual).',
  },
  {
    id: 'first_chat',
    title: 'Primera consulta',
    desc: 'Prueba 3 prompts típicos — el modelo cita la carta.',
  },
  {
    id: 'invite_team',
    title: 'Invita a tu equipo',
    desc: 'Opcional — añade somms y staff de sala.',
  },
] as const;

type OnboardingState = {
  product: string;
  steps: readonly string[];
  state: Record<string, { completed_at?: string }>;
  startedAt: string | null;
  completedAt: string | null;
};

export default function OnboardingPage(): JSX.Element {
  const [stepIdx, setStepIdx] = useState(0);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const current = STEPS[stepIdx];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/onboarding/state');
        if (!r.ok) return;
        const data = (await r.json()) as OnboardingState;
        if (cancelled) return;
        const doneMap: Record<string, boolean> = {};
        for (const key of Object.keys(data.state ?? {})) {
          const step = key.split('.')[1];
          if (step) doneMap[step] = true;
        }
        setCompleted(doneMap);
        if (data.completedAt) setDone(true);
        // Resume on first incomplete step
        const firstIncomplete = STEPS.findIndex((s) => !doneMap[s.id]);
        if (firstIncomplete >= 0) setStepIdx(firstIncomplete);
      } catch {
        // ignore — start fresh
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function completeStep(): Promise<void> {
    if (!current || busy) return;
    setBusy(true);
    try {
      await fetch('/api/onboarding/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'sommelier', step: current.id }),
      });
      const next = { ...completed, [current.id]: true };
      setCompleted(next);
      if (stepIdx + 1 < STEPS.length) {
        setStepIdx(stepIdx + 1);
      } else {
        await fetch('/api/onboarding/complete', { method: 'POST' });
        setDone(true);
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold">Onboarding completado</h1>
        <p className="text-gray-600">
          Tu sala Wined está lista. Ve al dashboard para empezar.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-3xl font-bold">Bienvenido a Wined</h1>
      <p className="mb-8 text-gray-600">
        Configuremos tu sala en menos de 15 minutos.
      </p>

      <div className="mb-8 flex gap-2">
        {STEPS.map((s, i) => {
          const isDone = completed[s.id];
          const isCurrent = i === stepIdx;
          const cls = isDone
            ? 'bg-wined-500'
            : isCurrent
              ? 'bg-wined-200'
              : 'bg-gray-200';
          return <div key={s.id} className={`h-2 flex-1 rounded-full ${cls}`} />;
        })}
      </div>

      {current && (
        <div className="rounded-lg border p-8">
          <div className="mb-2 text-sm text-gray-500">
            Paso {stepIdx + 1} de {STEPS.length}
          </div>
          <h2 className="mb-3 text-2xl font-semibold">{current.title}</h2>
          <p className="mb-6 text-gray-600">{current.desc}</p>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
              disabled={stepIdx === 0 || busy}
              className="px-4 py-2 text-gray-600 disabled:opacity-50"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={completeStep}
              disabled={busy}
              className="rounded-md bg-wined-500 px-6 py-2 text-white hover:bg-wined-700 disabled:opacity-50"
            >
              {stepIdx + 1 === STEPS.length ? 'Finalizar' : 'Siguiente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
