import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSession } from '../lib/session';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSession(req);
  if (!session) return res.status(200).json(null);
  return res.json(session);
}

