import type { VercelRequest } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { parse as parseCookies } from 'cookie';

export interface SessionUser {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

const COOKIE_NAME = 'vocab_session';

export function getSession(req: VercelRequest): SessionUser | null {
  try {
    // Try Authorization header first (dev cross-origin mode)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const secret = process.env.NEXTAUTH_SECRET!;
      const payload = jwt.verify(token, secret) as jwt.JwtPayload;
      return {
        userId: payload.sub as string,
        name: (payload.name as string) ?? null,
        email: (payload.email as string) ?? null,
        image: (payload.picture as string) ?? null,
      };
    }

    // Fall back to cookie
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;

    const secret = process.env.NEXTAUTH_SECRET!;
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;

    return {
      userId: payload.sub as string,
      name: (payload.name as string) ?? null,
      email: (payload.email as string) ?? null,
      image: (payload.picture as string) ?? null,
    };
  } catch {
    return null;
  }
}

export function createSessionCookie(user: {
  id: string;
  name: string | null;
  email: string | null;
  picture: string | null;
}): string {
  const secret = process.env.NEXTAUTH_SECRET!;
  const token = jwt.sign(
    {
      sub: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture,
    },
    secret,
    { expiresIn: '30d' }
  );

  const maxAge = 30 * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  // In dev (cross-origin between :3001 and :4200), use SameSite=None
  const sameSite = process.env.NODE_ENV === 'production' ? 'Lax' : 'None';
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly${secureFlag}; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}
