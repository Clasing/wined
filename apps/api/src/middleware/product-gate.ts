import type { MiddlewareHandler } from "hono";
import { getAuth, type AuthProduct } from "@wined/auth";

/**
 * Product gating middleware.
 *
 * Allows the request through if the org's product matches any in `allowed`
 * OR if the org has the `both` product (which spans all verticals).
 */
export function productGate(
  allowed: Array<AuthProduct>,
): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuth(c);
    if (auth.product !== "both" && !allowed.includes(auth.product)) {
      return c.json(
        {
          error: "product_not_authorized",
          requiredProduct: allowed,
          currentProduct: auth.product,
        },
        403,
      );
    }
    await next();
    return;
  };
}
