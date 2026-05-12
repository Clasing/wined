import { makeWorker, type IngestionClassifyJob } from '@wined/ingestion';

export function startIngestionClassifierWorker(): ReturnType<typeof makeWorker<IngestionClassifyJob>> {
  return makeWorker<IngestionClassifyJob>('ingestion.classify', async ({ data }) => {
    console.log('[ingestion-classifier] received', data.documentId);
    // TODO Step 28: clasificar, extraer, encolar embed
    return { ok: true };
  });
}
