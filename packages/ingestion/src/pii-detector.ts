export type PiiHit = {
  type: "dni" | "nie" | "email" | "phone_es" | "name_candidate";
  value: string;
  offset: number;
  redacted: string; // versión enmascarada
};

const DNI_RE = /\b\d{8}[A-HJ-NP-TV-Z]\b/g; // 8 dígitos + letra
const NIE_RE = /\b[XYZ]\d{7}[A-HJ-NP-TV-Z]\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_ES_RE = /\b(\+34\s?)?[6789]\d{2}\s?\d{3}\s?\d{3}\b/g;

function redact(value: string, type: PiiHit["type"]): string {
  if (type === "email") {
    const [user, dom] = value.split("@");
    if (!user || !dom) return value.replace(/./g, "*");
    return `${user.slice(0, 2)}***@${dom}`;
  }
  return value.replace(/./g, (c, i) =>
    i < 2 || i >= value.length - 2 ? c : "*",
  );
}

function scanRegex(
  text: string,
  regex: RegExp,
  type: PiiHit["type"],
): PiiHit[] {
  const hits: PiiHit[] = [];
  for (const m of text.matchAll(regex)) {
    if (m.index === undefined) continue;
    hits.push({
      type,
      value: m[0],
      offset: m.index,
      redacted: redact(m[0], type),
    });
  }
  return hits;
}

export function detectPii(text: string): PiiHit[] {
  return [
    ...scanRegex(text, DNI_RE, "dni"),
    ...scanRegex(text, NIE_RE, "nie"),
    ...scanRegex(text, EMAIL_RE, "email"),
    ...scanRegex(text, PHONE_ES_RE, "phone_es"),
  ];
}

export type PiiScanResult = {
  hasPii: boolean;
  hits: PiiHit[];
  summary: Record<PiiHit["type"], number>;
};

export function scanPii(text: string): PiiScanResult {
  const sample = text.slice(0, 50_000); // limita el análisis a primeros 50k chars
  const hits = detectPii(sample);
  const summary: PiiScanResult["summary"] = {
    dni: 0,
    nie: 0,
    email: 0,
    phone_es: 0,
    name_candidate: 0,
  };
  for (const h of hits) summary[h.type]++;
  return { hasPii: hits.length > 0, hits, summary };
}
