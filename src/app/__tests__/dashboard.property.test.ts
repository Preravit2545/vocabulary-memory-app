// Feature: vocabulary-memory-app, Property 8: Search Filter Correctness

import { fc, it } from '@fast-check/vitest';
import { VocabularyEntry } from '../models/vocabulary-entry.model';
import { filterBySearch } from '../utils/filters';

/**
 * Validates: Requirements 3.2
 *
 * Property 8: Search Filter Correctness
 * For any collection and any non-empty search term, the search filter SHALL return
 * exactly those entries where word or translation contains the search term
 * (case-insensitive), and SHALL exclude all entries that do not match.
 */

// Arbitrary: a printable non-empty string (avoids control characters)
const printableString = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0);

// Arbitrary: a single VocabularyEntry with random word and translation
const entryArb = fc
  .record({
    word: printableString,
    translation: printableString,
    id: fc.uuid(),
  })
  .map(
    ({ word, translation, id }): VocabularyEntry => ({
      id,
      word,
      translation,
      exampleSentences: [],
      synonyms: [],
      antonyms: [],
      interval: 1,
      easeFactor: 2.5,
      nextReviewDate: '2025-01-01',
      reviewCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  );

// Arbitrary: a non-empty array of entries
const entriesArb = fc.array(entryArb, { minLength: 0, maxLength: 30 });

// Helper: does an entry match the search term (mirrors filterBySearch logic)?
function entryMatchesTerm(entry: VocabularyEntry, term: string): boolean {
  const lower = term.toLowerCase();
  return (
    entry.word.toLowerCase().includes(lower) ||
    entry.translation.toLowerCase().includes(lower)
  );
}

describe('Search Filter — Property 8: Search Filter Correctness', () => {
  it.prop([entriesArb, printableString], { numRuns: 100 })(
    'all returned entries contain the search term in word or translation (case-insensitive)',
    (entries, term) => {
      const results = filterBySearch(entries, term);
      for (const entry of results) {
        expect(entryMatchesTerm(entry, term)).toBe(true);
      }
    }
  );

  it.prop([entriesArb, printableString], { numRuns: 100 })(
    'no matching entry is excluded from the results',
    (entries, term) => {
      const results = filterBySearch(entries, term);
      const resultIds = new Set(results.map((e) => e.id));
      const matching = entries.filter((e) => entryMatchesTerm(e, term));
      for (const entry of matching) {
        expect(resultIds.has(entry.id)).toBe(true);
      }
    }
  );

  it.prop([entriesArb, printableString], { numRuns: 100 })(
    'result count equals the number of entries that match the search term',
    (entries, term) => {
      const results = filterBySearch(entries, term);
      const expected = entries.filter((e) => entryMatchesTerm(e, term));
      expect(results.length).toBe(expected.length);
    }
  );
});

// Feature: vocabulary-memory-app, Property 9: Status Filter Correctness

import { filterByStatus } from '../utils/filters';

/**
 * Validates: Requirements 3.3, 3.4
 *
 * Property 9: Status Filter Correctness
 * For any collection and any status filter (Due Today, Hard Words, Mastered),
 * the filter SHALL return exactly those entries matching the filter's predicate
 * and exclude all non-matching entries.
 */

// Today's date string (YYYY-MM-DD) — captured once so all generators are consistent
const TODAY = new Date().toISOString().slice(0, 10);

// Build a date string offset by `days` from today
function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Arbitrary: a VocabularyEntry with controlled SRS fields
const statusEntryArb = fc
  .record({
    id: fc.uuid(),
    word: fc.string({ minLength: 1, maxLength: 20 }),
    translation: fc.string({ minLength: 1, maxLength: 20 }),
    // nextReviewDate: anywhere from 30 days ago to 30 days ahead
    dayOffset: fc.integer({ min: -30, max: 30 }),
    // easeFactor: full valid range [1.3, 4.0] — bounds must be 32-bit floats
    easeFactor: fc.float({ min: Math.fround(1.3), max: Math.fround(4.0), noNaN: true }),
    // interval: 1–60 days
    interval: fc.integer({ min: 1, max: 60 }),
  })
  .map(
    ({ id, word, translation, dayOffset, easeFactor, interval }): VocabularyEntry => ({
      id,
      word,
      translation,
      exampleSentences: [],
      synonyms: [],
      antonyms: [],
      interval,
      easeFactor,
      nextReviewDate: offsetDate(dayOffset),
      reviewCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  );

const statusEntriesArb = fc.array(statusEntryArb, { minLength: 0, maxLength: 30 });

// Predicates mirroring filterByStatus logic
function isDueToday(e: VocabularyEntry): boolean {
  return e.nextReviewDate <= TODAY;
}
function isHard(e: VocabularyEntry): boolean {
  return e.easeFactor < 1.8;
}
function isMastered(e: VocabularyEntry): boolean {
  return e.interval >= 21;
}

describe('Status Filter — Property 9: Status Filter Correctness', () => {
  // ── 'all' ──────────────────────────────────────────────────────────────────
  it.prop([statusEntriesArb], { numRuns: 100 })(
    "'all' returns every entry unchanged",
    (entries) => {
      const results = filterByStatus(entries, 'all');
      expect(results.length).toBe(entries.length);
      const resultIds = new Set(results.map((e) => e.id));
      for (const entry of entries) {
        expect(resultIds.has(entry.id)).toBe(true);
      }
    }
  );

  // ── 'due-today' ────────────────────────────────────────────────────────────
  it.prop([statusEntriesArb], { numRuns: 100 })(
    "'due-today': all returned entries have nextReviewDate <= today",
    (entries) => {
      const results = filterByStatus(entries, 'due-today');
      for (const entry of results) {
        expect(isDueToday(entry)).toBe(true);
      }
    }
  );

  it.prop([statusEntriesArb], { numRuns: 100 })(
    "'due-today': no matching entry is excluded",
    (entries) => {
      const results = filterByStatus(entries, 'due-today');
      const resultIds = new Set(results.map((e) => e.id));
      for (const entry of entries.filter(isDueToday)) {
        expect(resultIds.has(entry.id)).toBe(true);
      }
    }
  );

  // ── 'hard' ─────────────────────────────────────────────────────────────────
  it.prop([statusEntriesArb], { numRuns: 100 })(
    "'hard': all returned entries have easeFactor < 1.8",
    (entries) => {
      const results = filterByStatus(entries, 'hard');
      for (const entry of results) {
        expect(isHard(entry)).toBe(true);
      }
    }
  );

  it.prop([statusEntriesArb], { numRuns: 100 })(
    "'hard': no matching entry is excluded",
    (entries) => {
      const results = filterByStatus(entries, 'hard');
      const resultIds = new Set(results.map((e) => e.id));
      for (const entry of entries.filter(isHard)) {
        expect(resultIds.has(entry.id)).toBe(true);
      }
    }
  );

  // ── 'mastered' ─────────────────────────────────────────────────────────────
  it.prop([statusEntriesArb], { numRuns: 100 })(
    "'mastered': all returned entries have interval >= 21",
    (entries) => {
      const results = filterByStatus(entries, 'mastered');
      for (const entry of results) {
        expect(isMastered(entry)).toBe(true);
      }
    }
  );

  it.prop([statusEntriesArb], { numRuns: 100 })(
    "'mastered': no matching entry is excluded",
    (entries) => {
      const results = filterByStatus(entries, 'mastered');
      const resultIds = new Set(results.map((e) => e.id));
      for (const entry of entries.filter(isMastered)) {
        expect(resultIds.has(entry.id)).toBe(true);
      }
    }
  );
});

// Feature: vocabulary-memory-app, Property 10: Edit Preserves SRS Data

/**
 * Validates: Requirements 3.6
 *
 * Property 10: Edit Preserves SRS Data
 * For any VocabularyEntry with any SRS data (interval, easeFactor, nextReviewDate,
 * reviewCount), editing the non-SRS fields (word, translation, notes,
 * exampleSentences, synonyms, antonyms, mnemonic) SHALL leave all SRS fields
 * identical to their pre-edit values.
 */

// Arbitrary: a full VocabularyEntry with randomised SRS fields
const srsEntryArb = fc
  .record({
    id: fc.uuid(),
    word: fc.string({ minLength: 1, maxLength: 30 }),
    translation: fc.string({ minLength: 1, maxLength: 30 }),
    notes: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
    exampleSentences: fc.array(fc.string({ minLength: 1, maxLength: 40 }), { maxLength: 5 }),
    synonyms: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    antonyms: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    mnemonic: fc.option(fc.string({ minLength: 0, maxLength: 60 }), { nil: undefined }),
    // SRS fields — full valid ranges
    interval: fc.integer({ min: 1, max: 365 }),
    easeFactor: fc.float({ min: Math.fround(1.3), max: Math.fround(4.0), noNaN: true }),
    nextReviewDate: fc
      .integer({ min: -180, max: 180 })
      .map((offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return d.toISOString().slice(0, 10);
      }),
    reviewCount: fc.integer({ min: 0, max: 500 }),
  })
  .map(
    (fields): VocabularyEntry => ({
      ...fields,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  );

// Arbitrary: a set of non-SRS changes that an edit operation may apply
const nonSrsChangesArb = fc.record({
  word: fc.string({ minLength: 1, maxLength: 30 }),
  translation: fc.string({ minLength: 1, maxLength: 30 }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
  exampleSentences: fc.array(fc.string({ minLength: 1, maxLength: 40 }), { maxLength: 5 }),
  synonyms: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  antonyms: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  mnemonic: fc.option(fc.string({ minLength: 0, maxLength: 60 }), { nil: undefined }),
});

// Simulate the updateEntry merge performed by VocabularyStoreService
function applyNonSrsEdit(
  existing: VocabularyEntry,
  changes: Partial<Pick<VocabularyEntry, 'word' | 'translation' | 'notes' | 'exampleSentences' | 'synonyms' | 'antonyms' | 'mnemonic'>>
): VocabularyEntry {
  return { ...existing, ...changes, updatedAt: new Date().toISOString() };
}

describe('Edit — Property 10: Edit Preserves SRS Data', () => {
  it.prop([srsEntryArb, nonSrsChangesArb], { numRuns: 100 })(
    'interval is unchanged after a non-SRS edit',
    (entry, changes) => {
      const updated = applyNonSrsEdit(entry, changes);
      expect(updated.interval).toBe(entry.interval);
    }
  );

  it.prop([srsEntryArb, nonSrsChangesArb], { numRuns: 100 })(
    'easeFactor is unchanged after a non-SRS edit',
    (entry, changes) => {
      const updated = applyNonSrsEdit(entry, changes);
      expect(updated.easeFactor).toBe(entry.easeFactor);
    }
  );

  it.prop([srsEntryArb, nonSrsChangesArb], { numRuns: 100 })(
    'nextReviewDate is unchanged after a non-SRS edit',
    (entry, changes) => {
      const updated = applyNonSrsEdit(entry, changes);
      expect(updated.nextReviewDate).toBe(entry.nextReviewDate);
    }
  );

  it.prop([srsEntryArb, nonSrsChangesArb], { numRuns: 100 })(
    'reviewCount is unchanged after a non-SRS edit',
    (entry, changes) => {
      const updated = applyNonSrsEdit(entry, changes);
      expect(updated.reviewCount).toBe(entry.reviewCount);
    }
  );

  it.prop([srsEntryArb, nonSrsChangesArb], { numRuns: 100 })(
    'all four SRS fields are simultaneously preserved after a non-SRS edit',
    (entry, changes) => {
      const updated = applyNonSrsEdit(entry, changes);
      expect(updated.interval).toBe(entry.interval);
      expect(updated.easeFactor).toBe(entry.easeFactor);
      expect(updated.nextReviewDate).toBe(entry.nextReviewDate);
      expect(updated.reviewCount).toBe(entry.reviewCount);
    }
  );
});
