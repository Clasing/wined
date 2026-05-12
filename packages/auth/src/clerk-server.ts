import { createClerkClient, verifyToken as clerkVerifyToken } from "@clerk/backend";

const secretKey = process.env["CLERK_SECRET_KEY"];

export const clerkClient = createClerkClient({
  secretKey: secretKey ?? "",
});

export type VerifiedTokenPayload = Awaited<ReturnType<typeof clerkVerifyToken>>;

/**
 * Verify a Clerk-issued JWT. Returns the decoded payload if valid,
 * throws otherwise. The caller is responsible for catching and
 * mapping to a 401 response.
 */
export async function verifyToken(token: string): Promise<VerifiedTokenPayload> {
  const key = process.env["CLERK_SECRET_KEY"];
  if (!key) {
    throw new Error("CLERK_SECRET_KEY is not set");
  }
  return clerkVerifyToken(token, { secretKey: key });
}
