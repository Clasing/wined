import { Hono } from "hono";
import { vineyardsRoute } from "./vineyards.js";
import { depositsRoute } from "./deposits.js";
import { vintagesRoute } from "./vintages.js";
import { lotsRoute } from "./lots.js";
import { labRoute } from "./lab.js";
import { intakesRoute } from "./intakes.js";
import { scheduledOpsRoute } from "./scheduled.js";

export const cellarRoute = new Hono();
cellarRoute.route("/vineyards", vineyardsRoute);
cellarRoute.route("/deposits", depositsRoute);
cellarRoute.route("/vintages", vintagesRoute);
cellarRoute.route("/lots", lotsRoute);
cellarRoute.route("/lab", labRoute);
cellarRoute.route("/intakes", intakesRoute);
cellarRoute.route("/scheduled", scheduledOpsRoute);
