import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSession } from '../lib/session';
import { sql } from '../lib/db';
import { rowToEntry, entryToRow } from '../db/mapper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT * FROM vocabulary_entries 
      WHERE user_id = ${session.userId}
      ORDER BY created_at DESC
    `;
    return res.json(rows.map(rowToEntry));
  }

  if (req.method === 'POST') {
    const entry = req.body;
    const row = entryToRow(entry);
    await sql`
      INSERT INTO vocabulary_entries (
        id, user_id, word, translation, original_sentence, notes,
        example_sentences, synonyms, antonyms, mnemonic,
        interval, ease_factor, next_review_date, review_count,
        created_at, updated_at
      ) VALUES (
        ${row.id}, ${session.userId}, ${row.word}, ${row.translation},
        ${row.original_sentence}, ${row.notes},
        ${row.example_sentences}::jsonb, ${row.synonyms}::jsonb,
        ${row.antonyms}::jsonb, ${row.mnemonic},
        ${row.interval}, ${row.ease_factor}, ${row.next_review_date},
        ${row.review_count}, ${row.created_at}, ${row.updated_at}
      )
    `;
    const [created] = await sql`SELECT * FROM vocabulary_entries WHERE id = ${row.id}`;
    return res.status(201).json(rowToEntry(created));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
