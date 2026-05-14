import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSession } from '../lib/session.ts';
import { sql } from '../lib/db.ts';
import { rowToEntry, entryToRow } from '../db/mapper.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query as { id: string };

  if (req.method === 'PUT') {
    // First check if the entry exists at all
    const [existing] = await sql`SELECT user_id FROM vocabulary_entries WHERE id = ${id}`;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.user_id !== session.userId) return res.status(403).json({ error: 'Forbidden' });

    const entry = req.body;
    const row = entryToRow(entry);
    const [updated] = await sql`
      UPDATE vocabulary_entries SET
        word = ${row.word},
        translation = ${row.translation},
        original_sentence = ${row.original_sentence},
        notes = ${row.notes},
        example_sentences = ${row.example_sentences}::jsonb,
        synonyms = ${row.synonyms}::jsonb,
        antonyms = ${row.antonyms}::jsonb,
        mnemonic = ${row.mnemonic},
        interval = ${row.interval},
        ease_factor = ${row.ease_factor},
        next_review_date = ${row.next_review_date},
        review_count = ${row.review_count},
        updated_at = ${row.updated_at}
      WHERE id = ${id} AND user_id = ${session.userId}
      RETURNING *
    `;
    return res.json(rowToEntry(updated));
  }

  if (req.method === 'DELETE') {
    // First check if the entry exists at all
    const [existing] = await sql`SELECT user_id FROM vocabulary_entries WHERE id = ${id}`;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.user_id !== session.userId) return res.status(403).json({ error: 'Forbidden' });

    await sql`DELETE FROM vocabulary_entries WHERE id = ${id} AND user_id = ${session.userId}`;
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
