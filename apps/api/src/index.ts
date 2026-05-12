import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getAuth } from "@wined/auth";
import { env } from "./env.js";
import { healthRoute } from "./routes/health.js";
import { adminRoute } from "./routes/admin.js";
import { ingestRoute } from "./routes/ingest.js";
import { distributorRoute } from "./routes/distributor.js";
import { distributorSheetsRoute } from "./routes/distributor-sheets.js";
import { horecaRoute } from "./routes/horeca-clients.js";
import { chatRoute } from "./routes/chat.js";
import { conversationsRoute } from "./routes/conversations.js";
import { cellarRoute } from "./routes/cellar/index.js";
import { sommelierRoute } from "./routes/sommelier.js";
import { guestsRoute } from "./routes/sommelier-guests.js";
import { feedbackRoute } from "./routes/feedback.js";
import { gdprRoute } from "./routes/gdpr.js";
import { meRoute } from "./routes/me.js";
import { orgSettingsRoute } from "./routes/org-settings.js";
import { onboardingRoute } from "./routes/onboarding.js";
import { signupVerticalRoute } from "./routes/signup-vertical.js";
import { salesRoute } from "./routes/sales.js";
import { agentInvocationsRoute } from "./routes/agent-invocations.js";
import { workspacesRoute } from "./routes/workspaces.js";
import { clerkAuth } from "./middleware/clerk.js";
import { tenantGuard } from "./middleware/tenant-guard.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { disclaimer } from "./middleware/disclaimer.js";
import { productGate } from "./middleware/product-gate.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

const app = new Hono();

// Public routes
app.route("/health", healthRoute);

// Protected routes: clerk → tenantGuard → rateLimit → disclaimer
const protectedRoutes = new Hono();
protectedRoutes.use("*", clerkAuth());
protectedRoutes.use("*", tenantGuard);
protectedRoutes.use("*", rateLimit);
protectedRoutes.use("*", disclaimer);

protectedRoutes.route("/v1/admin", adminRoute);
protectedRoutes.route("/v1/ingest", ingestRoute);

// Distributor vertical — gated to product=distributor or both
protectedRoutes.use("/v1/distributor/*", productGate(["distributor"]));
protectedRoutes.route("/v1/distributor", distributorRoute);
protectedRoutes.route("/v1/distributor/sheets", distributorSheetsRoute);
protectedRoutes.route("/v1/distributor/horeca-clients", horecaRoute);

protectedRoutes.route("/v1/chat", chatRoute);
protectedRoutes.route("/v1/conversations", conversationsRoute);

// Cellar vertical — gated to product=cellar or both
protectedRoutes.use("/v1/cellar/*", productGate(["cellar"]));
protectedRoutes.route("/v1/cellar", cellarRoute);

// Sommelier vertical — gated to product=sommelier or both
protectedRoutes.use("/v1/sommelier/*", productGate(["sommelier"]));
protectedRoutes.route("/v1/sommelier", sommelierRoute);
protectedRoutes.route("/v1/sommelier/guests", guestsRoute);

protectedRoutes.route("/v1", feedbackRoute);
protectedRoutes.route("/v1", gdprRoute);
protectedRoutes.route("/v1/me/memory", meRoute);
protectedRoutes.route("/v1/org/settings", orgSettingsRoute);
protectedRoutes.route("/v1/onboarding", onboardingRoute);
protectedRoutes.route("/v1/signup", signupVerticalRoute);
protectedRoutes.route("/v1/sales", salesRoute);
protectedRoutes.route("/v1/agent-invocations", agentInvocationsRoute);
protectedRoutes.route("/v1/workspaces", workspacesRoute);

protectedRoutes.get("/v1/me", (c) => {
  const auth = getAuth(c);
  return c.json({
    auth,
    disclaimer_needed: c.var.disclaimer_needed,
  });
});

app.route("/", protectedRoutes);

app.notFound(notFoundHandler);
app.onError(errorHandler);

// Only start the server when run directly (not when imported, e.g. by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const portRaw = process.env["PORT"];
  const port = portRaw ? Number(portRaw) : 8787;

  // Optionally start BullMQ workers in-process when WINED_START_WORKERS=1.
  if (process.env["WINED_START_WORKERS"] === "1") {
    const { startIngestionClassifierWorker } = await import(
      "./workers/ingestion-classifier-worker.js"
    );
    const { startEmbeddingWorker } = await import(
      "./workers/embedding-worker.js"
    );
    const { startCuratorWorker } = await import(
      "./workers/curator-worker.js"
    );
    const { startDistributorCatalogWorker } = await import(
      "./workers/distributor-catalog-worker.js"
    );
    const { startGdprExportWorker } = await import(
      "./workers/gdpr-export-worker.js"
    );
    const { startCitationValidatorWorker } = await import(
      "./workers/citation-validator-worker.js"
    );
    const { startStockPriceImportWorker } = await import(
      "./workers/stock-price-import-worker.js"
    );
    startIngestionClassifierWorker();
    startEmbeddingWorker();
    startCuratorWorker();
    startDistributorCatalogWorker();
    startGdprExportWorker();
    startCitationValidatorWorker();
    startStockPriceImportWorker();
    // eslint-disable-next-line no-console
    console.log("[wined-api] BullMQ workers started");
  }

  serve({ fetch: app.fetch, port }, (info) => {
    // eslint-disable-next-line no-console
    console.log(
      `[wined-api] listening on http://localhost:${info.port} (env=${env.NODE_ENV})`,
    );
  });
}

export { app };
