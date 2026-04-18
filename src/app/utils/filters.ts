import { VocabularyEntry, FilterStatus } from '../models/vocabulary-entry.model';

/**
 * Filters entries by a search term (case-insensitive match on word or translation).
 * Returns all entries if term is empty.
 */
export function filterBySearch(entries: VocabularyEntry[], term: string): VocabularyEntry[] {
  if (term === '') return entries;
  const lower = term.toLowerCase();
  return entries.filter(
    (e) => e.word.toLowerCase().includes(lower) || e.translation.toLowerCase().includes(lower)
  );
}

/**
 * Filters entries by status:
 * - 'all'       → all entries
 * - 'due-today' → nextReviewDate <= today (YYYY-MM-DD)
 * - 'hard'      → easeFactor < 1.8
 * - 'mastered'  → interval >= 21
 */
export function filterByStatus(entries: VocabularyEntry[], status: FilterStatus): VocabularyEntry[] {
  if (status === 'all') return entries;

  if (status === 'due-today') {
    const today = new Date().toISOString().slice(0, 10);
    return entries.filter((e) => e.nextReviewDate <= today);
  }

  if (status === 'hard') {
    return entries.filter((e) => e.easeFactor < 1.8);
  }

  // 'mastered'
  return entries.filter((e) => e.interval >= 21);
}
