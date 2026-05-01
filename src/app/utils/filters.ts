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
 * Hard Words predicate: depends ONLY on easeFactor — NOT on interval or nextReviewDate.
 */
export const isHardWord = (entry: VocabularyEntry): boolean => entry.easeFactor < 1.8;

/**
 * Mastered predicate: interval >= 21 days.
 */
export const isMastered = (entry: VocabularyEntry): boolean => entry.interval >= 21;

/**
 * Due Today predicate: nextReviewDate <= today (YYYY-MM-DD).
 */
export const isDueToday = (entry: VocabularyEntry, today: string): boolean =>
  entry.nextReviewDate <= today;

/**
 * Filters entries by status:
 * - 'all'       → all entries
 * - 'due-today' → nextReviewDate <= today (YYYY-MM-DD)
 * - 'hard'      → easeFactor < 1.8 (only — not interval or nextReviewDate)
 * - 'mastered'  → interval >= 21
 */
export function filterByStatus(entries: VocabularyEntry[], status: FilterStatus): VocabularyEntry[] {
  if (status === 'all') return entries;

  if (status === 'due-today') {
    const today = new Date().toISOString().slice(0, 10);
    return entries.filter((e) => isDueToday(e, today));
  }

  if (status === 'hard') {
    return entries.filter(isHardWord);
  }

  // 'mastered'
  return entries.filter(isMastered);
}
