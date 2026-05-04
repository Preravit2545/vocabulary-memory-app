import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie } from '../lib/session';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(200).json({ ok: true });
}
