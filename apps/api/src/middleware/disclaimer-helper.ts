import { createDb, conversations } from "@wined/db";
import { eq } from "drizzle-orm";

export type DisclaimerCheck = {
  show: boolean;
  mark: () => Promise<void>;
};

/**
 * Decide whether the legal disclaimer should be emitted for the given
 * conversation. New conversations (no id) always show it; existing ones
 * show it only if `disclaimer_shown` is still false.
 *
 * `mark` flips the column to true. It is a no-op for new conversations
 * (the caller is expected to set the column when inserting the row).
 */
export async function checkDisclaimer(opts: {
  dbUrl: string;
  conversationId?: string;
}): Promise<DisclaimerCheck> {
  if (!opts.conversationId) {
    return { show: true, mark: async () => {} };
  }
  const db = createDb(opts.dbUrl);
  const [conv] = await db
    .select({ disclaimerShown: conversations.disclaimerShown })
    .from(conversations)
    .where(eq(conversations.id, opts.conversationId));
  if (!conv) {
    return { show: true, mark: async () => {} };
  }
  return {
    show: !conv.disclaimerShown,
    mark: async () => {
      await db
        .update(conversations)
        .set({ disclaimerShown: true })
        .where(eq(conversations.id, opts.conversationId!));
    },
  };
}

export function disclaimerMessage(lang: "es" | "en"): string {
  return lang === "en"
    ? "🤖 I am an AI assistant by Wined. My answers should be verified — especially for technical, legal, or medical topics."
    : "🤖 Soy un asistente de IA de Wined. Mis respuestas deben verificarse — especialmente en temas técnicos, legales o médicos.";
}
