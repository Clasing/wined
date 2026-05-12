"use client";
import { useState } from "react";

type Props = {
  invocationId?: string;
  citations: string[];
  cacheHit: boolean;
  latencyMs: number;
  model: string;
};

export function ShowYourWork({
  citations,
  cacheHit,
  latencyMs,
  model,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-cellar-700 hover:underline"
      >
        {open ? "▾" : "▸"} Show your work · {citations.length} citas ·{" "}
        {cacheHit ? "cache hit" : "live"} · {model} · {latencyMs}ms
      </button>
      {open && (
        <div className="mt-2 bg-gray-50 rounded p-3 text-xs space-y-2">
          <div>
            <strong>Model:</strong> {model}
          </div>
          <div>
            <strong>Latency:</strong> {latencyMs}ms
          </div>
          <div>
            <strong>Cache:</strong> {cacheHit ? "HIT" : "MISS"}
          </div>
          <div>
            <strong>Citations ({citations.length}):</strong>
            <ul className="list-disc ml-4 mt-1">
              {citations.map((c) => (
                <li key={c} className="font-mono">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
