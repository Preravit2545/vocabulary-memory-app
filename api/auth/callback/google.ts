import type { VercelRequest, VercelResponse } from '@vercel/node';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { sql } from '../../lib/db.ts';
import { createSessionCookie } from '../../lib/session.ts';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.AUTH_URL}/api/auth/callback/google`
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code } = req.query as { code?: string };
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    // Exchange authorization code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Verify the ID token and extract user info
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID!,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      return res.status(400).json({ error: 'Invalid ID token' });
    }

    const googleUser = {
      id: payload.sub,
      name: payload.name ?? null,
      email: payload.email ?? null,
      picture: payload.picture ?? null,
    };

    // Upsert user in DB
    await sql`
      INSERT INTO users (id, name, email, image)
      VALUES (${googleUser.id}, ${googleUser.name}, ${googleUser.email}, ${googleUser.picture})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image
    `;

    // Create JWT session token
    const cookie = createSessionCookie(googleUser);
    res.setHeader('Set-Cookie', cookie);

    // In dev: pass token via URL so Angular can store it (cross-origin cookie issue)
    // In prod: redirect to root (same origin, cookie works fine)
    if (process.env.NODE_ENV !== 'production') {
      const token = jwt.sign(
        { sub: googleUser.id, name: googleUser.name, email: googleUser.email, picture: googleUser.picture },
        process.env.NEXTAUTH_SECRET!,
        { expiresIn: '30d' }
      );
      res.redirect(`http://localhost:4200/?session_token=${encodeURIComponent(token)}`);
    } else {
      res.redirect('/');
    }
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
