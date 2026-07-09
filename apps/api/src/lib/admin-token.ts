import { jwtVerify, SignJWT } from 'jose';

export interface AdminClaims {
  adminId: string;
  email: string;
}

const ALG = 'HS256';
export const ADMIN_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function signAdminToken(secret: string, claims: AdminClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.adminId)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyAdminToken(secret: string, token: string): Promise<AdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: [ALG],
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return { adminId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
