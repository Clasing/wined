'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

type Message = { role: 'user' | 'assistant'; content: string };
type WineCard = {
  producer: string;
  name: string;
  vintage?: number;
  do?: string;
  region?: string;
  wineType?: string;
  tastingNotes?: string;
  priceEur?: number;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [serviceMode, setServiceMode] = useState(false);
  const [canvasWine, setCanvasWine] = useState<WineCard | null>(null);

  async function send() {
    if (!input.trim()) return;
    const user: Message = { role: 'user', content: input };
    setMessages((m) => [...m, user]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: user.content, serviceMode }),
      });
      const text = await res.text();
      setMessages((m) => [...m, { role: 'assistant', content: text }]);

      // Heuristic: try to extract first wine mentioned for canvas
      const wineMatch = text.match(/([A-Z][a-zA-ZáéíóúñÁÉÍÓÚÑ\s&'-]+?)\s+(?:de|del|of)?\s*(\d{4})/);
      if (wineMatch) {
        setCanvasWine({
          producer: 'Productor',
          name: wineMatch[1]!.trim(),
          vintage: Number(wineMatch[2]!),
        });
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Error de conexión' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-4">
      {/* Chat column */}
      <div className="flex flex-1 flex-col">
        <h1 className="mb-4 text-2xl font-bold">Chat</h1>
        <div className="flex-1 space-y-3 overflow-y-auto rounded-md border p-4">
          {messages.length === 0 && (
            <p className="text-gray-500">
              Pregunta por un maridaje, ej: &quot;para solomillo a la pimienta &lt; 40€&quot;
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-md p-3 ${
                m.role === 'user' ? 'bg-wined-50 text-right' : 'bg-gray-50'
              }`}
            >
              <span className="text-xs font-semibold text-gray-500">
                {m.role === 'user' ? 'Tú' : 'Wined'}
              </span>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
          {loading && <p className="text-sm text-gray-400">Wined está pensando…</p>}
        </div>

        <label className="mb-2 mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={serviceMode}
            onChange={(e) => setServiceMode(e.target.checked)}
          />
          Modo servicio (respuestas cortas)
        </label>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Tu pregunta…"
            className="flex-1 rounded-md border px-3 py-2"
          />
          <button
            onClick={send}
            disabled={loading}
            className="rounded-md bg-wined-500 px-4 py-2 text-white hover:bg-wined-700 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>

      {/* Canvas column */}
      {canvasWine && (
        <aside className="w-80 border-l pl-4">
          <div className="sticky top-0">
            <button onClick={() => setCanvasWine(null)} className="mb-2 text-xs text-gray-500">
              Cerrar →
            </button>
            <h2 className="mb-2 text-lg font-semibold">{canvasWine.name}</h2>
            <p className="mb-3 text-sm text-gray-600">
              {canvasWine.producer}
              {canvasWine.vintage ? ` · ${canvasWine.vintage}` : ''}
            </p>

            {canvasWine.do && (
              <div className="mb-3">
                <div className="text-xs uppercase text-gray-500">Denominación</div>
                <div className="text-sm">{canvasWine.do}</div>
              </div>
            )}

            {canvasWine.region && (
              <div className="mb-3">
                <div className="text-xs uppercase text-gray-500">Región</div>
                <div className="text-sm">{canvasWine.region}</div>
                <div className="mt-2 flex h-32 items-center justify-center rounded-md bg-gradient-to-br from-wined-50 to-wined-200 text-xs text-wined-700">
                  Mapa de {canvasWine.region}
                </div>
              </div>
            )}

            {canvasWine.wineType && (
              <div className="mb-3">
                <div className="text-xs uppercase text-gray-500">Tipo</div>
                <div className="text-sm">{canvasWine.wineType}</div>
              </div>
            )}

            {canvasWine.tastingNotes && (
              <div className="mb-3">
                <div className="text-xs uppercase text-gray-500">Nota de cata</div>
                <p className="text-sm">{canvasWine.tastingNotes}</p>
              </div>
            )}

            {canvasWine.priceEur !== undefined && (
              <div className="mb-3">
                <div className="text-xs uppercase text-gray-500">Precio</div>
                <div className="text-lg font-semibold">{canvasWine.priceEur} €</div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
