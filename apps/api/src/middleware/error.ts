import type { ErrorHandler, NotFoundHandler } from "hono";

/**
 * Structured 404 handler.
 */
export const notFoundHandler: NotFoundHandler = (c) =>
  c.json({ error: "not_found", path: c.req.path }, 404);

/**
 * Structured top-level error handler. Logs the error server-side and
 * returns a sanitized JSON body. The full stack trace is NOT leaked.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  // eslint-disable-next-line no-console
  console.error("[wined-api] unhandled error", err);
  return c.json(
    {
      error: "internal_server_error",
      message: err.message,
    },
    500,
  );
};
