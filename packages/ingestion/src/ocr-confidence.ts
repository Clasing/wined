import type { ParseResult } from './parsers/types.js';

export type OcrCheckResult =
  | { status: 'ok'; confidence?: number }
  | { status: 'low_confidence'; confidence: number; reason: 'low_ocr' };

export const OCR_CONFIDENCE_THRESHOLD = 0.70;

export function evaluateOcrConfidence(parseResult: ParseResult): OcrCheckResult {
  if (parseResult.confidence === undefined) return { status: 'ok' };
  if (parseResult.confidence < OCR_CONFIDENCE_THRESHOLD) {
    return { status: 'low_confidence', confidence: parseResult.confidence, reason: 'low_ocr' };
  }
  return { status: 'ok', confidence: parseResult.confidence };
}

export type OcrLowConfidenceEvent = {
  type: 'document.ocr_low_confidence';
  documentId: string;
  orgId: string;
  confidence: number;
  reason: 'low_ocr';
  ts: string;
};

export function makeOcrLowConfidenceEvent(input: {
  documentId: string;
  orgId: string;
  confidence: number;
}): OcrLowConfidenceEvent {
  return {
    type: 'document.ocr_low_confidence',
    documentId: input.documentId,
    orgId: input.orgId,
    confidence: input.confidence,
    reason: 'low_ocr',
    ts: new Date().toISOString(),
  };
}
