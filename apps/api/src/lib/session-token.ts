import { jwtVerify, SignJWT } from 'jose';

export interface SessionClaims {
  clientId: string;
  slug: string;
  origin: string;
}

export interface SessionToken {
  token: string;
  expiresAt: Date;
}

const ALG = 'HS256';
export const SESSION_TTL_SECONDS = 60 * 60 * 24;

export async function signSessionToken(
  secret: string,
  sessionId: string,
  claims: SessionClaims,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<SessionToken> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALG })
    .setSubject(sessionId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt };
}

export async function verifySessionToken(
  secret: string,
  token: string,
): Promise<(SessionClaims & { sessionId: string }) | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: [ALG],
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.clientId !== 'string' ||
      typeof payload.slug !== 'string' ||
      typeof payload.origin !== 'string'
    ) {
      return null;
    }
    return {
      sessionId: payload.sub,
      clientId: payload.clientId,
      slug: payload.slug,
      origin: payload.origin,
    };
  } catch {
    return null;
  }
}
