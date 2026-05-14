// Define types inline to avoid importing from Angular app
// (--experimental-strip-types has issues with Angular decorator files)

export interface VocabularyEntry {
  id: string;
  word: string;
  translation: string;
  pos?: string;
  originalSentence?: string;
  notes?: string;
  exampleSentences: string[];
  synonyms: string[];
  antonyms: string[];
  mnemonic?: string;
  interval: number;
  easeFactor: number;
  nextReviewDate: string;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSession {
  id: string;
  date: string;
  reviewedCount: number;
  completedAt: string;
}

// Convert snake_case DB row to camelCase VocabularyEntry
export function rowToEntry(row: Record<string, unknown>): VocabularyEntry {
  // next_review_date can be a Date object or string depending on the driver
  const nextReviewRaw = row.next_review_date;
  const nextReviewDate = nextReviewRaw instanceof Date
    ? nextReviewRaw.toISOString().split('T')[0]
    : String(nextReviewRaw).split('T')[0];

  return {
    id: row.id as string,
    word: row.word as string,
    translation: row.translation as string,
    originalSentence: (row.original_sentence as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    exampleSentences: (row.example_sentences as string[]) ?? [],
    synonyms: (row.synonyms as string[]) ?? [],
    antonyms: (row.antonyms as string[]) ?? [],
    mnemonic: (row.mnemonic as string) ?? undefined,
    interval: row.interval as number,
    easeFactor: parseFloat(row.ease_factor as string),
    nextReviewDate,
    reviewCount: row.review_count as number,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

// Convert camelCase VocabularyEntry to snake_case for DB insert/update
export function entryToRow(entry: VocabularyEntry) {
  return {
    id: entry.id,
    word: entry.word,
    translation: entry.translation,
    original_sentence: entry.originalSentence ?? null,
    notes: entry.notes ?? null,
    example_sentences: JSON.stringify(entry.exampleSentences),
    synonyms: JSON.stringify(entry.synonyms),
    antonyms: JSON.stringify(entry.antonyms),
    mnemonic: entry.mnemonic ?? null,
    interval: entry.interval,
    ease_factor: entry.easeFactor,
    next_review_date: entry.nextReviewDate,
    review_count: entry.reviewCount,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

export function rowToSession(row: Record<string, unknown>): ReviewSession {
  const dateRaw = row.date;
  const date = dateRaw instanceof Date
    ? dateRaw.toISOString().split('T')[0]
    : String(dateRaw).split('T')[0];

  return {
    id: row.id as string,
    date,
    reviewedCount: row.reviewed_count as number,
    completedAt: (row.completed_at as Date).toISOString(),
  };
}
