import { jwtAuth as baseJwtAuth } from '@wined/auth';
import { getDb } from '../db.js';
import { env } from '../env.js';

/**
 * Pre-bound JWT auth middleware that injects the API's shared DbClient + secret.
 * Kept under the legacy export name to minimize churn at call sites.
 * Usage: `app.use('*', jwtAuth())`.
 */
export function jwtAuth() {
  return baseJwtAuth({ db: getDb(), secret: env.JWT_SECRET });
}

// Back-compat alias — some code still imports `clerkAuth`.
export const clerkAuth = jwtAuth;
