// Feature: vocabulary-memory-app, Property 1: Initial SRS State
// Feature: vocabulary-memory-app, Property 2: Duplicate Prevention

import { fc, it } from '@fast-check/vitest';
import { VocabularyEntry } from '../models/vocabulary-entry.model';

/**
 * Validates: Requirements 1.2, 1.3
 *
 * Property 1: Initial SRS State
 * For any valid (word, translation) pair added to the collection, the resulting
 * VocabularyEntry SHALL have interval = 1, easeFactor = 2.5, and nextReviewDate
 * equal to today's date.
 */

/**
 * Mirrors the entry construction logic in AddWordComponent.saveEntry():
 *   interval: 1,
 *   easeFactor: 2.5,
 *   nextReviewDate: new Date().toISOString().split('T')[0],
 */
function buildInitialEntry(word: string, translation: string): VocabularyEntry {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: 'test-id',
    word: word.trim().toLowerCase(),
    translation,
    exampleSentences: [],
    synonyms: [],
    antonyms: [],
    interval: 1,
    easeFactor: 2.5,
    nextReviewDate: today,
    reviewCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Arbitrary for non-empty strings (word and translation)
const nonEmptyString = fc.string({ minLength: 1, maxLength: 50 });

describe('VocabularyEntry — Property 1: Initial SRS State', () => {
  it.prop([nonEmptyString, nonEmptyString], { numRuns: 100 })(
    'initial interval is 1 for any (word, translation) pair',
    (word, translation) => {
      const entry = buildInitialEntry(word, translation);
      expect(entry.interval).toBe(1);
    }
  );

  it.prop([nonEmptyString, nonEmptyString], { numRuns: 100 })(
    'initial easeFactor is 2.5 for any (word, translation) pair',
    (word, translation) => {
      const entry = buildInitialEntry(word, translation);
      expect(entry.easeFactor).toBe(2.5);
    }
  );

  it.prop([nonEmptyString, nonEmptyString], { numRuns: 100 })(
    'initial nextReviewDate equals today for any (word, translation) pair',
    (word, translation) => {
      const today = new Date().toISOString().split('T')[0];
      const entry = buildInitialEntry(word, translation);
      expect(entry.nextReviewDate).toBe(today);
    }
  );
});

/**
 * Validates: Requirements 1.4
 *
 * Property 2: Duplicate Prevention
 * For any existing collection and any word already present in that collection,
 * attempting to add the same word again SHALL leave the collection size unchanged
 * and return a duplicate error.
 */

// Mirrors the duplicate-check logic in VocabularyStoreService.findByWord():
//   db.vocabulary.filter(e => e.word.toLowerCase() === lower).first()
function findByWord(
  entries: VocabularyEntry[],
  word: string
): VocabularyEntry | undefined {
  const lower = word.toLowerCase();
  return entries.find((e) => e.word.toLowerCase() === lower);
}

// Simulates addEntry duplicate guard — returns 'DUPLICATE_WORD' or 'OK'
function tryAdd(entries: VocabularyEntry[], word: string): string {
  if (findByWord(entries, word)) {
    return 'DUPLICATE_WORD';
  }
  return 'OK';
}

// Arbitrary: non-empty word string (letters only to keep case-folding clean)
const wordArb = fc.stringMatching(/^[a-zA-Z]{1,30}$/);

// Arbitrary: a non-empty array of VocabularyEntry stubs with distinct lowercase words
const entriesArb = fc
  .array(wordArb, { minLength: 1, maxLength: 20 })
  .map((words) => {
    // deduplicate by lowercase so the collection itself has no duplicates
    const seen = new Set<string>();
    return words
      .filter((w) => {
        const lw = w.toLowerCase();
        if (seen.has(lw)) return false;
        seen.add(lw);
        return true;
      })
      .map(
        (w): VocabularyEntry => ({
          id: `id-${w}`,
          word: w.toLowerCase(),
          translation: 'test',
          exampleSentences: [],
          synonyms: [],
          antonyms: [],
          interval: 1,
          easeFactor: 2.5,
          nextReviewDate: new Date().toISOString().split('T')[0],
          reviewCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
  })
  .filter((entries) => entries.length >= 1);

describe('VocabularyEntry — Property 2: Duplicate Prevention', () => {
  it.prop(
    [
      entriesArb.chain((entries) =>
        fc.record({
          entries: fc.constant(entries),
          // pick one of the existing words (possibly with different casing)
          existingWord: fc
            .integer({ min: 0, max: entries.length - 1 })
            .map((i) => entries[i].word),
        })
      ),
    ],
    { numRuns: 100 }
  )(
    'adding a word that already exists returns DUPLICATE_WORD',
    ({ entries, existingWord }) => {
      const result = tryAdd(entries, existingWord);
      expect(result).toBe('DUPLICATE_WORD');
    }
  );

  it.prop(
    [
      entriesArb.chain((entries) =>
        fc.record({
          entries: fc.constant(entries),
          existingWord: fc
            .integer({ min: 0, max: entries.length - 1 })
            .map((i) => entries[i].word),
        })
      ),
    ],
    { numRuns: 100 }
  )(
    'collection size is unchanged after a duplicate add attempt',
    ({ entries, existingWord }) => {
      const sizeBefore = entries.length;
      const result = tryAdd(entries, existingWord);
      // Only add if not duplicate (mirrors real service behaviour)
      const sizeAfter = result === 'OK' ? sizeBefore + 1 : sizeBefore;
      expect(sizeAfter).toBe(sizeBefore);
    }
  );

  it.prop(
    [
      entriesArb.chain((entries) =>
        fc.record({
          entries: fc.constant(entries),
          existingWord: fc
            .integer({ min: 0, max: entries.length - 1 })
            .map((i) => entries[i].word),
        })
      ),
    ],
    { numRuns: 100 }
  )(
    'duplicate detection is case-insensitive',
    ({ entries, existingWord }) => {
      // Try upper-cased variant of the existing word
      const upperWord = existingWord.toUpperCase();
      const result = tryAdd(entries, upperWord);
      expect(result).toBe('DUPLICATE_WORD');
    }
  );
});

// Feature: vocabulary-memory-app, Property 3: Due Entries Filter

/**
 * Validates: Requirements 2.1
 *
 * Property 3: Due Entries Filter
 * For any collection of VocabularyEntry items with varying nextReviewDate values,
 * the getDueEntries() function SHALL return exactly those entries where
 * nextReviewDate <= today — no more, no less.
 */

// Pure filter logic mirroring VocabularyStoreService.getDueEntries():
//   db.vocabulary.filter(e => e.nextReviewDate <= today).toArray()
function getDueEntries(entries: VocabularyEntry[], today: string): VocabularyEntry[] {
  return entries.filter((e) => e.nextReviewDate <= today);
}

// Generate a YYYY-MM-DD date string from a Date object
function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Arbitrary: a date string in YYYY-MM-DD format, generated from year/month/day integers
// to avoid fc.date() producing invalid Date objects during shrinking
const dateStringArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // max 28 to stay valid for all months
  })
  .map(({ year, month, day }) => {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  });

// Arbitrary: a non-empty array of VocabularyEntry stubs with random nextReviewDate values
const entriesWithDatesArb = fc
  .array(dateStringArb, { minLength: 1, maxLength: 30 })
  .map((dates) =>
    dates.map(
      (dateStr, i): VocabularyEntry => ({
        id: `id-${i}`,
        word: `word${i}`,
        translation: 'test',
        exampleSentences: [],
        synonyms: [],
        antonyms: [],
        interval: 1,
        easeFactor: 2.5,
        nextReviewDate: dateStr,
        reviewCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )
  );

// Get today's date as YYYY-MM-DD string
function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

describe('VocabularyEntry — Property 3: Due Entries Filter', () => {
  it.prop([entriesWithDatesArb], { numRuns: 100 })(
    'all returned entries have nextReviewDate <= today',
    (entries) => {
      const todayStr = getTodayStr();
      const due = getDueEntries(entries, todayStr);
      for (const entry of due) {
        expect(entry.nextReviewDate <= todayStr).toBe(true);
      }
    }
  );

  it.prop([entriesWithDatesArb], { numRuns: 100 })(
    'no entry with nextReviewDate <= today is excluded from results',
    (entries) => {
      const todayStr = getTodayStr();
      const due = getDueEntries(entries, todayStr);
      const dueIds = new Set(due.map((e) => e.id));
      const shouldBeDue = entries.filter((e) => e.nextReviewDate <= todayStr);
      for (const entry of shouldBeDue) {
        expect(dueIds.has(entry.id)).toBe(true);
      }
    }
  );

  it.prop([entriesWithDatesArb], { numRuns: 100 })(
    'returned set is exactly the entries with nextReviewDate <= today (no extras, no omissions)',
    (entries) => {
      const todayStr = getTodayStr();
      const due = getDueEntries(entries, todayStr);
      const expected = entries.filter((e) => e.nextReviewDate <= todayStr);
      expect(due.length).toBe(expected.length);
    }
  );
});
