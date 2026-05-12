import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_REGION: z.string().min(1),
    OBJECT_STORE_BUCKET: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_PUBLISHABLE_KEY: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    COHERE_API_KEY: z.string().min(1),
    EMBEDDING_PROVIDER: z.enum(["cohere", "openai", "voyage"]).default("cohere"),
    LANGFUSE_PUBLIC_KEY: z.string().min(1),
    LANGFUSE_SECRET_KEY: z.string().min(1),
    LANGFUSE_BASE_URL: z.string().url(),
    POSTHOG_API_KEY: z.string().min(1),
    POSTHOG_HOST: z.string().url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

// When executed directly (tsx src/env.ts) just print a confirmation.
// If validation fails, @t3-oss/env-core throws a structured error before reaching this line.
if (import.meta.url === `file://${process.argv[1]}`) {
  // eslint-disable-next-line no-console
  console.log("env: OK", { NODE_ENV: env.NODE_ENV });
}
