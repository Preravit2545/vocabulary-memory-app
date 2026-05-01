// Feature: vocabulary-memory-app, Property 19: Duplicate Detection Correctness

import { fc, it } from '@fast-check/vitest';
import { VocabularyEntry } from '../models/vocabulary-entry.model';

/**
 * Validates: Requirements 8.1, 8.3
 *
 * Property 19: Duplicate Detection Correctness
 * For any collection of VocabularyEntry items and any input word, the duplicate
 * check function SHALL return the existing entry if and only if the collection
 * contains an entry whose word matches the input word (case-insensitive), and
 * SHALL return null otherwise.
 */

/**
 * Pure helper that mirrors VocabularyStoreService.findByWord():
 *   db.vocabulary.filter(e => e.word.toLowerCase() === lower).first()
 */
export function findByWordPure(
  entries: VocabularyEntry[],
  word: string
): VocabularyEntry | null {
  const lower = word.toLowerCase();
  return entries.find((e) => e.word.toLowerCase() === lower) ?? null;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// Word strings: letters only, 1–30 chars — keeps case-folding clean
const wordArb = fc.stringMatching(/^[a-zA-Z]{1,30}$/);

// Build a minimal VocabularyEntry stub from a word string
function makeEntry(word: string, index: number): VocabularyEntry {
  return {
    id: `id-${index}-${word}`,
    word: word.toLowerCase(),
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
  };
}

// A collection of VocabularyEntry items with distinct lowercase words
const entriesArb = fc
  .array(wordArb, { minLength: 0, maxLength: 20 })
  .map((words) => {
    const seen = new Set<string>();
    return words
      .filter((w) => {
        const lw = w.toLowerCase();
        if (seen.has(lw)) return false;
        seen.add(lw);
        return true;
      })
      .map((w, i) => makeEntry(w, i));
  });

// A non-empty collection (at least one entry) for "word present" tests
const nonEmptyEntriesArb = entriesArb.filter((entries) => entries.length >= 1);

// ---------------------------------------------------------------------------
// Property 19a: word present → returns the matching entry
// ---------------------------------------------------------------------------

describe('Property 19: Duplicate Detection Correctness — word present', () => {
  it.prop(
    [
      nonEmptyEntriesArb.chain((entries) =>
        fc.record({
          entries: fc.constant(entries),
          // Pick one of the existing words (exact lowercase)
          existingWord: fc
            .integer({ min: 0, max: entries.length - 1 })
            .map((i) => entries[i].word),
        })
      ),
    ],
    { numRuns: 100 }
  )(
    'returns the existing entry when the word is present (exact match)',
    ({ entries, existingWord }) => {
      const result = findByWordPure(entries, existingWord);
      expect(result).not.toBeNull();
      expect(result!.word.toLowerCase()).toBe(existingWord.toLowerCase());
    }
  );

  it.prop(
    [
      nonEmptyEntriesArb.chain((entries) =>
        fc.record({
          entries: fc.constant(entries),
          // Pick one of the existing words and upper-case it to test case-insensitivity
          existingWordUpper: fc
            .integer({ min: 0, max: entries.length - 1 })
            .map((i) => entries[i].word.toUpperCase()),
        })
      ),
    ],
    { numRuns: 100 }
  )(
    'returns the existing entry when the word is present (case-insensitive — upper-cased input)',
    ({ entries, existingWordUpper }) => {
      const result = findByWordPure(entries, existingWordUpper);
      expect(result).not.toBeNull();
      expect(result!.word.toLowerCase()).toBe(existingWordUpper.toLowerCase());
    }
  );

  it.prop(
    [
      nonEmptyEntriesArb.chain((entries) =>
        fc.record({
          entries: fc.constant(entries),
          // Mixed-case variant of an existing word
          existingWordMixed: fc
            .integer({ min: 0, max: entries.length - 1 })
            .chain((i) => {
              const w = entries[i].word;
              // Flip case of each character randomly
              return fc
                .array(fc.boolean(), { minLength: w.length, maxLength: w.length })
                .map((flips) =>
                  w
                    .split('')
                    .map((ch, idx) => (flips[idx] ? ch.toUpperCase() : ch.toLowerCase()))
                    .join('')
                );
            }),
        })
      ),
    ],
    { numRuns: 100 }
  )(
    'returns the existing entry when the word is present (case-insensitive — mixed-case input)',
    ({ entries, existingWordMixed }) => {
      const result = findByWordPure(entries, existingWordMixed);
      expect(result).not.toBeNull();
      expect(result!.word.toLowerCase()).toBe(existingWordMixed.toLowerCase());
    }
  );
});

// ---------------------------------------------------------------------------
// Property 19b: word absent → returns null
// ---------------------------------------------------------------------------

describe('Property 19: Duplicate Detection Correctness — word absent', () => {
  it.prop(
    [
      entriesArb.chain((entries) => {
        // Generate a word that is guaranteed NOT to be in the collection
        const existingLower = new Set(entries.map((e) => e.word.toLowerCase()));
        return fc.record({
          entries: fc.constant(entries),
          absentWord: wordArb.filter((w) => !existingLower.has(w.toLowerCase())),
        });
      }),
    ],
    { numRuns: 100 }
  )(
    'returns null when the word is not present in the collection',
    ({ entries, absentWord }) => {
      const result = findByWordPure(entries, absentWord);
      expect(result).toBeNull();
    }
  );

  it.prop([fc.constant([]), wordArb], { numRuns: 100 })(
    'returns null for any word when the collection is empty',
    (entries, word) => {
      const result = findByWordPure(entries, word);
      expect(result).toBeNull();
    }
  );
});

// ---------------------------------------------------------------------------
// Property 19c: if-and-only-if (biconditional) — combined check
// ---------------------------------------------------------------------------

describe('Property 19: Duplicate Detection Correctness — biconditional', () => {
  it.prop(
    [
      entriesArb.chain((entries) =>
        fc.record({
          entries: fc.constant(entries),
          inputWord: wordArb,
        })
      ),
    ],
    { numRuns: 100 }
  )(
    'result is non-null iff collection contains a case-insensitive match',
    ({ entries, inputWord }) => {
      const result = findByWordPure(entries, inputWord);
      const collectionHasMatch = entries.some(
        (e) => e.word.toLowerCase() === inputWord.toLowerCase()
      );

      if (collectionHasMatch) {
        expect(result).not.toBeNull();
        expect(result!.word.toLowerCase()).toBe(inputWord.toLowerCase());
      } else {
        expect(result).toBeNull();
      }
    }
  );
});
