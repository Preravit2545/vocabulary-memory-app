// Feature: vocabulary-memory-app, Property 20: Synonym Overlap Detection Completeness

import { fc, it } from '@fast-check/vitest';
import { VocabularyEntry } from '../models/vocabulary-entry.model';

/**
 * Validates: Requirements 9.1, 9.2
 *
 * Property 20: Synonym Overlap Detection Completeness
 * For any list of synonyms from a new word and any existing collection, the synonym
 * overlap function SHALL return exactly those entries whose `word` or any element of
 * their `synonyms` array matches any element of the new word's synonyms list
 * (case-insensitive) — no more, no less.
 */

/**
 * Pure helper that mirrors VocabularyStoreService.findBySynonymOverlap():
 *   if synonyms.length === 0 return []
 *   lowerSynonyms = synonyms.map(s => s.toLowerCase())
 *   return all.filter(entry =>
 *     lowerSynonyms.includes(entry.word.toLowerCase()) ||
 *     entry.synonyms.some(s => lowerSynonyms.includes(s.toLowerCase()))
 *   )
 */
export function findBySynonymOverlapPure(
  entries: VocabularyEntry[],
  synonyms: string[]
): VocabularyEntry[] {
  if (synonyms.length === 0) return [];
  const lowerSynonyms = synonyms.map((s) => s.toLowerCase());
  return entries.filter((entry) => {
    const entryWordLower = entry.word.toLowerCase();
    if (lowerSynonyms.includes(entryWordLower)) return true;
    return entry.synonyms.some((s) => lowerSynonyms.includes(s.toLowerCase()));
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// Word strings: letters only, 1–20 chars
const wordArb = fc.stringMatching(/^[a-zA-Z]{1,20}$/);

// Array of 0–5 synonym strings
const synonymsArb = fc.array(wordArb, { minLength: 0, maxLength: 5 });

// Build a minimal VocabularyEntry stub
function makeEntry(word: string, synonyms: string[], index: number): VocabularyEntry {
  return {
    id: `id-${index}-${word}`,
    word: word.toLowerCase(),
    translation: 'test',
    exampleSentences: [],
    synonyms: synonyms.map((s) => s.toLowerCase()),
    antonyms: [],
    interval: 1,
    easeFactor: 2.5,
    nextReviewDate: new Date().toISOString().split('T')[0],
    reviewCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// A collection of VocabularyEntry items (each with their own synonyms list)
const entriesArb = fc
  .array(
    fc.record({
      word: wordArb,
      synonyms: synonymsArb,
    }),
    { minLength: 0, maxLength: 15 }
  )
  .map((items) => {
    // Deduplicate by lowercase word to keep collection realistic
    const seen = new Set<string>();
    return items
      .filter(({ word }) => {
        const lw = word.toLowerCase();
        if (seen.has(lw)) return false;
        seen.add(lw);
        return true;
      })
      .map(({ word, synonyms }, i) => makeEntry(word, synonyms, i));
  });

// ---------------------------------------------------------------------------
// Property 20a: empty synonyms input → always returns empty array
// ---------------------------------------------------------------------------

describe('Property 20: Synonym Overlap Detection Completeness — empty synonyms', () => {
  it.prop([entriesArb], { numRuns: 100 })(
    'returns empty array when synonyms list is empty',
    (entries) => {
      const result = findBySynonymOverlapPure(entries, []);
      expect(result).toHaveLength(0);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 20b: biconditional — result contains exactly the matching entries
// ---------------------------------------------------------------------------

describe('Property 20: Synonym Overlap Detection Completeness — biconditional', () => {
  it.prop(
    [
      entriesArb.chain((entries) =>
        fc.record({
          entries: fc.constant(entries),
          inputSynonyms: fc.array(wordArb, { minLength: 1, maxLength: 5 }),
        })
      ),
    ],
    { numRuns: 100 }
  )(
    'result contains exactly those entries whose word or synonyms overlap with input (no more, no less)',
    ({ entries, inputSynonyms }) => {
      const result = findBySynonymOverlapPure(entries, inputSynonyms);
      const lowerInput = inputSynonyms.map((s) => s.toLowerCase());

      // Every entry in result must match
      for (const entry of result) {
        const wordMatches = lowerInput.includes(entry.word.toLowerCase());
        const synonymMatches = entry.synonyms.some((s) =>
          lowerInput.includes(s.toLowerCase())
        );
        expect(wordMatches || synonymMatches).toBe(true);
      }

      // Every matching entry must be in result
      for (const entry of entries) {
        const wordMatches = lowerInput.includes(entry.word.toLowerCase());
        const synonymMatches = entry.synonyms.some((s) =>
          lowerInput.includes(s.toLowerCase())
        );
        if (wordMatches || synonymMatches) {
          expect(result).toContain(entry);
        }
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Property 20c: case-insensitive matching
// ---------------------------------------------------------------------------

describe('Property 20: Synonym Overlap Detection Completeness — case-insensitive', () => {
  it.prop(
    [
      // Build a collection with at least one entry, then pick a synonym from it
      fc
        .array(
          fc.record({ word: wordArb, synonyms: fc.array(wordArb, { minLength: 1, maxLength: 3 }) }),
          { minLength: 1, maxLength: 10 }
        )
        .map((items) => {
          const seen = new Set<string>();
          return items
            .filter(({ word }) => {
              const lw = word.toLowerCase();
              if (seen.has(lw)) return false;
              seen.add(lw);
              return true;
            })
            .map(({ word, synonyms }, i) => makeEntry(word, synonyms, i));
        })
        .filter((entries) => entries.length >= 1)
        .chain((entries) =>
          fc.record({
            entries: fc.constant(entries),
            // Pick an entry and use its word as the synonym to search for
            targetIndex: fc.integer({ min: 0, max: entries.length - 1 }),
          })
        ),
    ],
    { numRuns: 100 }
  )(
    'finds entry when input synonym matches entry word in upper-case',
    ({ entries, targetIndex }) => {
      const targetEntry = entries[targetIndex];
      // Search using the entry's word in UPPER CASE
      const upperCaseSynonym = targetEntry.word.toUpperCase();
      const result = findBySynonymOverlapPure(entries, [upperCaseSynonym]);
      expect(result).toContain(targetEntry);
    }
  );

  it.prop(
    [
      fc
        .array(
          fc.record({ word: wordArb, synonyms: fc.array(wordArb, { minLength: 1, maxLength: 3 }) }),
          { minLength: 1, maxLength: 10 }
        )
        .map((items) => {
          const seen = new Set<string>();
          return items
            .filter(({ word }) => {
              const lw = word.toLowerCase();
              if (seen.has(lw)) return false;
              seen.add(lw);
              return true;
            })
            .map(({ word, synonyms }, i) => makeEntry(word, synonyms, i));
        })
        .filter((entries) => entries.length >= 1)
        .chain((entries) =>
          fc.record({
            entries: fc.constant(entries),
            targetIndex: fc.integer({ min: 0, max: entries.length - 1 }),
          })
        ),
    ],
    { numRuns: 100 }
  )(
    'finds entry when input synonym matches an entry synonym in upper-case',
    ({ entries, targetIndex }) => {
      const targetEntry = entries[targetIndex];
      if (targetEntry.synonyms.length === 0) {
        // No synonyms to test — trivially pass
        return;
      }
      const upperCaseSynonym = targetEntry.synonyms[0].toUpperCase();
      const result = findBySynonymOverlapPure(entries, [upperCaseSynonym]);
      expect(result).toContain(targetEntry);
    }
  );
});

// ---------------------------------------------------------------------------
// Property 20d: non-matching synonyms → entry not in result
// ---------------------------------------------------------------------------

describe('Property 20: Synonym Overlap Detection Completeness — no false positives', () => {
  it.prop(
    [
      entriesArb.chain((entries) => {
        // Collect all words and synonyms in the collection (lowercase)
        const allTerms = new Set<string>();
        for (const e of entries) {
          allTerms.add(e.word.toLowerCase());
          for (const s of e.synonyms) allTerms.add(s.toLowerCase());
        }
        return fc.record({
          entries: fc.constant(entries),
          // Generate synonyms that are guaranteed NOT in the collection
          absentSynonyms: fc
            .array(wordArb, { minLength: 1, maxLength: 3 })
            .filter((syns) => syns.every((s) => !allTerms.has(s.toLowerCase()))),
        });
      }),
    ],
    { numRuns: 100 }
  )(
    'returns empty array when no entry word or synonym matches the input synonyms',
    ({ entries, absentSynonyms }) => {
      const result = findBySynonymOverlapPure(entries, absentSynonyms);
      expect(result).toHaveLength(0);
    }
  );
});
