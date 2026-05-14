import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSession } from '../lib/session.js';
import { sql } from '../lib/db.js';
import { rowToSession } from '../db/mapper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT * FROM review_sessions 
      WHERE user_id = ${session.userId}
      ORDER BY date DESC
    `;
    return res.json(rows.map(rowToSession));
  }

  if (req.method === 'POST') {
    const s = req.body;
    await sql`
      INSERT INTO review_sessions (id, user_id, date, reviewed_count, completed_at)
      VALUES (${s.id}, ${session.userId}, ${s.date}, ${s.reviewedCount}, ${s.completedAt})
      ON CONFLICT (id) DO NOTHING
    `;
    const [created] = await sql`SELECT * FROM review_sessions WHERE id = ${s.id}`;
    return res.status(201).json(rowToSession(created));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
