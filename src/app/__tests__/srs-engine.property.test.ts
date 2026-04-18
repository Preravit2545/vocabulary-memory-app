// Feature: vocabulary-memory-app, Property 4: Forgot Rating Invariants

import { fc, it } from '@fast-check/vitest';
import { TestBed } from '@angular/core/testing';
import { SrsEngineService } from '../services/srs-engine.service';
import { VocabularyEntry } from '../models/vocabulary-entry.model';

/**
 * Validates: Requirements 2.5, 2.9
 *
 * Property 4: Forgot Rating Invariants
 * For any VocabularyEntry with any interval and easeFactor, applying the Forgot rating
 * SHALL produce newInterval = 1, nextReviewDate = today, and newEaseFactor = max(easeFactor - 0.2, 1.3).
 */

function arbitraryVocabularyEntry() {
  return fc
    .record({
      interval: fc.integer({ min: 1, max: 365 }),
      // Use double precision floats in [1.3, 4.0] range
      easeFactor: fc.double({ min: 1.3, max: 4.0, noNaN: true }),
    })
    .map(
      ({ interval, easeFactor }): VocabularyEntry => ({
        id: 'test-id',
        word: 'test',
        translation: 'test-translation',
        exampleSentences: [],
        synonyms: [],
        antonyms: [],
        interval,
        easeFactor,
        nextReviewDate: '2024-01-01',
        reviewCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
}

// SrsEngineService has no dependencies, so we can inject it directly via TestBed
// using a minimal environment without requiring @angular/platform-browser-dynamic
function getSrsService(): SrsEngineService {
  return TestBed.inject(SrsEngineService);
}

describe('SrsEngineService — Property 4: Forgot Rating Invariants', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'Forgot rating resets interval to 1',
    (entry) => {
      const srs = new SrsEngineService();
      const result = srs.applyRating(entry, 'forgot');
      expect(result.newInterval).toBe(1);
    }
  );

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'Forgot rating sets nextReviewDate to today',
    (entry) => {
      const srs = new SrsEngineService();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = srs.applyRating(entry, 'forgot');
      const resultDate = new Date(result.nextReviewDate);
      resultDate.setHours(0, 0, 0, 0);

      expect(resultDate.getTime()).toBe(today.getTime());
    }
  );

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'Forgot rating decreases easeFactor by 0.2 with minimum of 1.3',
    (entry) => {
      const srs = new SrsEngineService();
      const result = srs.applyRating(entry, 'forgot');
      const expected = Math.max(entry.easeFactor - 0.2, 1.3);

      expect(result.newEaseFactor).toBeGreaterThanOrEqual(1.3);
      expect(result.newEaseFactor).toBeCloseTo(expected, 5);
    }
  );
});

// Feature: vocabulary-memory-app, Property 5: Hard Rating Invariants

/**
 * Validates: Requirements 2.6
 *
 * Property 5: Hard Rating Invariants
 * For any VocabularyEntry with any positive interval, applying the Hard rating
 * SHALL produce newInterval = floor(interval × 1.2) (minimum 1) and
 * nextReviewDate = today + newInterval, with easeFactor unchanged.
 */
describe('SrsEngineService — Property 5: Hard Rating Invariants', () => {
  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'Hard rating sets newInterval to max(floor(interval * 1.2), 1)',
    (entry) => {
      const srs = new SrsEngineService();
      const result = srs.applyRating(entry, 'hard');
      const expected = Math.max(Math.floor(entry.interval * 1.2), 1);
      expect(result.newInterval).toBe(expected);
    }
  );

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'Hard rating sets nextReviewDate to today + newInterval days',
    (entry) => {
      const srs = new SrsEngineService();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = srs.applyRating(entry, 'hard');
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() + result.newInterval);

      const resultDate = new Date(result.nextReviewDate);
      resultDate.setHours(0, 0, 0, 0);

      expect(resultDate.getTime()).toBe(expectedDate.getTime());
    }
  );

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'Hard rating leaves easeFactor unchanged',
    (entry) => {
      const srs = new SrsEngineService();
      const result = srs.applyRating(entry, 'hard');
      expect(result.newEaseFactor).toBe(entry.easeFactor);
    }
  );
});

// Feature: vocabulary-memory-app, Property 6: Easy Rating Invariants

/**
 * Validates: Requirements 2.7, 2.8
 *
 * Property 6: Easy Rating Invariants
 * For any VocabularyEntry with any interval and easeFactor, applying the Easy rating
 * SHALL produce newInterval = floor(interval × easeFactor), nextReviewDate = today + newInterval,
 * and newEaseFactor = min(easeFactor + 0.1, 4.0).
 */
describe('SrsEngineService — Property 6: Easy Rating Invariants', () => {
  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'Easy rating sets newInterval to floor(interval * easeFactor)',
    (entry) => {
      const srs = new SrsEngineService();
      const result = srs.applyRating(entry, 'easy');
      const expected = Math.floor(entry.interval * entry.easeFactor);
      expect(result.newInterval).toBe(expected);
    }
  );

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'Easy rating sets nextReviewDate to today + newInterval days',
    (entry) => {
      const srs = new SrsEngineService();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = srs.applyRating(entry, 'easy');
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() + result.newInterval);

      const resultDate = new Date(result.nextReviewDate);
      resultDate.setHours(0, 0, 0, 0);

      expect(resultDate.getTime()).toBe(expectedDate.getTime());
    }
  );

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'Easy rating increases easeFactor by 0.1 with maximum of 4.0',
    (entry) => {
      const srs = new SrsEngineService();
      const result = srs.applyRating(entry, 'easy');
      const expected = Math.min(entry.easeFactor + 0.1, 4.0);

      expect(result.newEaseFactor).toBeLessThanOrEqual(4.0);
      expect(result.newEaseFactor).toBeCloseTo(expected, 5);
    }
  );
});

// Feature: vocabulary-memory-app, Property 7: Deck Shuffle Randomness

import { shuffleDeck } from '../utils/shuffle';

/**
 * Validates: Requirements 2.12
 *
 * Property 7: Deck Shuffle Randomness
 * For any review deck with 10 or more entries, shuffling the deck multiple times
 * SHALL NOT always produce the same ordering (at least two shuffles must differ).
 * Also verifies that shuffleDeck preserves all elements and returns a new array.
 */

function arbitraryDeckOf10Plus() {
  return fc
    .array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 10, maxLength: 30 })
    .filter((arr) => new Set(arr).size >= 5); // ensure enough distinct values for meaningful shuffle detection
}

describe('shuffleDeck — Property 7: Deck Shuffle Randomness', () => {
  it.prop([arbitraryDeckOf10Plus()], { numRuns: 100 })(
    'shuffling a deck 10 times produces at least two different orderings',
    (deck) => {
      const shuffles = Array.from({ length: 10 }, () => shuffleDeck(deck));
      const serialized = shuffles.map((s) => JSON.stringify(s));
      const uniqueOrderings = new Set(serialized);
      // At least 2 distinct orderings must appear across 10 shuffles
      expect(uniqueOrderings.size).toBeGreaterThan(1);
    }
  );

  it.prop([arbitraryDeckOf10Plus()], { numRuns: 100 })(
    'shuffleDeck preserves all elements (same elements, possibly different order)',
    (deck) => {
      const shuffled = shuffleDeck(deck);
      expect(shuffled).toHaveLength(deck.length);
      expect([...shuffled].sort()).toEqual([...deck].sort());
    }
  );

  it.prop([arbitraryDeckOf10Plus()], { numRuns: 100 })(
    'shuffleDeck returns a new array and does not mutate the original',
    (deck) => {
      const original = [...deck];
      const shuffled = shuffleDeck(deck);
      // Must be a different reference
      expect(shuffled).not.toBe(deck);
      // Original must be unchanged
      expect(deck).toEqual(original);
    }
  );
});
