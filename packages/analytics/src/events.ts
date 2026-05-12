/**
 * Canonical analytics event catalog (SPEC §8).
 * Use these constants (never raw strings) when calling `track()`.
 */
export const ANALYTICS_EVENTS = {
  // Activation
  USER_SIGNED_UP: "user.signed_up",
  ONBOARDING_STARTED: "onboarding.started",
  ONBOARDING_STEP_COMPLETED: "onboarding.step_completed",
  ONBOARDING_COMPLETED: "onboarding.completed",
  ONBOARDING_ABANDONED: "onboarding.abandoned",

  // Documents
  DOCUMENT_UPLOADED: "document.uploaded",
  DOCUMENT_INDEXED: "document.indexed",
  DOCUMENT_OCR_LOW_CONFIDENCE: "document.ocr_low_confidence",
  DOCUMENT_PII_DETECTED: "document.pii_detected",

  // Chat
  CHAT_MESSAGE_SENT: "chat.message_sent",
  CHAT_MESSAGE_RECEIVED: "chat.message_received",
  CHAT_ABSTAINED: "chat.abstained",
  CHAT_CACHE_HIT: "chat.cache_hit",
  CHAT_GUARDRAIL_BLOCKED: "chat.guardrail_blocked",

  // Feedback
  FEEDBACK_GIVEN: "feedback.given",

  // Sommelier
  WINE_LIST_INGESTED: "sommelier.wine_list_ingested",
  WINE_LIST_ACTIVATED: "sommelier.wine_list_activated",
  GUEST_CREATED: "sommelier.guest_created",
  PAIRING_REQUESTED: "sommelier.pairing_requested",

  // Cellar
  CALC_INVOKED: "cellar.calc_invoked",
  LAB_REPORT_INGESTED: "cellar.lab_report_ingested",
  ANOMALY_DETECTED: "cellar.anomaly_detected",

  // Distributor
  CATALOG_INGESTED: "distributor.catalog_ingested",
  COMMERCIAL_SHEET_GENERATED: "distributor.commercial_sheet_generated",

  // Workspace lifecycle
  WORKSPACE_CREATED: "workspace.created",
  CHURN_SIGNAL: "churn.signal",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
