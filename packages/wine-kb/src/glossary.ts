// Controlled glossary for ES↔EN wine-domain translation.
// Each entry is canonical; use buildGlossaryPrompt() to inject into LLM prompts.

export type GlossaryCategory =
  | "do"
  | "classification"
  | "aging"
  | "style"
  | "process"
  | "descriptor";

export type GlossaryEntry = {
  es: string;
  en: string;
  category: GlossaryCategory;
  definition?: string;
};

export const WINE_GLOSSARY: GlossaryEntry[] = [
  // DOs (always invariant — never translate)
  { es: "Rioja", en: "Rioja", category: "do" },
  { es: "Ribera del Duero", en: "Ribera del Duero", category: "do" },
  { es: "Rías Baixas", en: "Rías Baixas", category: "do" },
  {
    es: "Jerez",
    en: "Sherry",
    category: "do",
    definition:
      'Andalusian fortified wine DO; "Jerez/Xérès/Sherry" is the official triple-name',
  },
  { es: "Cava", en: "Cava", category: "do" },

  // Classifications / aging
  {
    es: "Crianza",
    en: "Crianza (aged)",
    category: "aging",
    definition:
      "Minimum 24 months total aging, with 6-12 months in oak depending on DO.",
  },
  {
    es: "Reserva",
    en: "Reserva",
    category: "aging",
    definition: "36 months total, 12 in oak (Rioja red; varies by DO).",
  },
  {
    es: "Gran Reserva",
    en: "Gran Reserva",
    category: "aging",
    definition: "60 months total, 24 in oak (Rioja red; varies).",
  },
  { es: "Joven", en: "Young / Joven", category: "aging" },
  { es: "Roble", en: "Oak-aged", category: "aging" },

  // Styles
  { es: "tinto", en: "red", category: "style" },
  { es: "blanco", en: "white", category: "style" },
  { es: "rosado", en: "rosé", category: "style" },
  { es: "espumoso", en: "sparkling", category: "style" },
  { es: "dulce", en: "sweet", category: "style" },
  { es: "seco", en: "dry", category: "style" },
  { es: "semi-seco", en: "off-dry", category: "style" },
  { es: "generoso", en: "fortified", category: "style" },

  // Process
  { es: "crianza biológica", en: "biological aging (flor)", category: "process" },
  { es: "crianza oxidativa", en: "oxidative aging", category: "process" },
  { es: "maceración carbónica", en: "carbonic maceration", category: "process" },
  {
    es: "fermentación maloláctica",
    en: "malolactic fermentation",
    category: "process",
  },

  // Descriptors
  { es: "taninos", en: "tannins", category: "descriptor" },
  { es: "acidez", en: "acidity", category: "descriptor" },
  { es: "cuerpo", en: "body", category: "descriptor" },
  { es: "fruta roja", en: "red fruit", category: "descriptor" },
  { es: "fruta negra", en: "black fruit", category: "descriptor" },
  { es: "notas balsámicas", en: "balsamic notes", category: "descriptor" },
];

export type TranslationDirection = "es_to_en" | "en_to_es";

export function buildGlossaryPrompt(direction: TranslationDirection): string {
  const fromKey: "es" | "en" = direction === "es_to_en" ? "es" : "en";
  const toKey: "es" | "en" = direction === "es_to_en" ? "en" : "es";
  const lines = WINE_GLOSSARY.map((e) => {
    const base = `- "${e[fromKey]}" → "${e[toKey]}"`;
    return e.definition ? `${base} (${e.definition})` : base;
  });
  return ["Use this controlled glossary EXACTLY (do not deviate):", ...lines].join(
    "\n",
  );
}
