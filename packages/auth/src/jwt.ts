import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const ACCESS_TTL_SEC = 15 * 60; // 15 min
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 d

export type AccessClaims = JWTPayload & {
  sub: string; // user id
  org: string; // organization id
  role: 'admin' | 'editor' | 'viewer';
  product: 'sommelier' | 'cellar' | 'distributor' | 'both';
  email: string;
};

export async function signAccessToken(
  claims: Omit<AccessClaims, 'iat' | 'exp' | 'iss'>,
  secret: string,
): Promise<string> {
  return await new SignJWT(claims as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('wined')
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'wined' });
  return payload as AccessClaims;
}

export const ACCESS_TTL_SEC_EXPORT = ACCESS_TTL_SEC;
export const REFRESH_TTL_SEC_EXPORT = REFRESH_TTL_SEC;
