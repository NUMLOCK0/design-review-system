import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export type SessionClaims = { id?: string; role?: string; roles?: string[]; exp?: number; nbf?: number };

export async function getServerSessionClaims(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get('auth_token')?.value;
  if (!rawToken) return null;

  let token = rawToken;
  try { token = decodeURIComponent(rawToken); } catch { /* use the cookie value as-is */ }
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart) return null;

  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') return null;
    const secret = String(process.env.JWT_SECRET || '').trim() || 'local-development-secret-change-me';
    const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
    const received = Buffer.from(signaturePart, 'base64url');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

    const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as SessionClaims;
    const now = Math.floor(Date.now() / 1000);
    if ((typeof claims.exp === 'number' && claims.exp <= now) || (typeof claims.nbf === 'number' && claims.nbf > now)) return null;
    return claims;
  } catch {
    return null;
  }
}
