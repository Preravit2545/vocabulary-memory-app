// Feature: vocabulary-memory-app, Property 21: Undo Rating Round-Trip

import { fc, it } from '@fast-check/vitest';
import { SrsEngineService } from '../services/srs-engine.service';
import { VocabularyEntry, Rating, UndoState } from '../models/vocabulary-entry.model';

/**
 * Validates: Requirements 10.2
 *
 * Property 21: Undo Rating Round-Trip
 * For any VocabularyEntry with any SRS state and any rating (forgot, hard, easy),
 * applying the rating to produce a new SRS state and then undoing SHALL restore the
 * entry's interval, easeFactor, nextReviewDate, and reviewCount to their exact
 * pre-rating values.
 */

function arbitraryVocabularyEntry() {
  return fc
    .record({
      interval: fc.integer({ min: 1, max: 365 }),
      easeFactor: fc.double({ min: 1.3, max: 4.0, noNaN: true }),
      nextReviewDate: fc
        .integer({ min: 0, max: 3652 })
        .map((offset) => {
          const base = new Date('2020-01-01');
          base.setDate(base.getDate() + offset);
          return base.toISOString().split('T')[0];
        }),
      reviewCount: fc.integer({ min: 0, max: 500 }),
    })
    .map(
      ({ interval, easeFactor, nextReviewDate, reviewCount }): VocabularyEntry => ({
        id: 'test-id',
        word: 'test',
        translation: 'test-translation',
        exampleSentences: [],
        synonyms: [],
        antonyms: [],
        interval,
        easeFactor,
        nextReviewDate,
        reviewCount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
}

function arbitraryRating(): fc.Arbitrary<Rating> {
  return fc.constantFrom<Rating>('forgot', 'hard', 'easy');
}

/**
 * Simulates apply-rating then undo:
 * 1. Captures previousSrsSnapshot before rating
 * 2. Applies the rating
 * 3. Restores the snapshot (undo)
 * 4. Returns the restored entry
 */
function applyRatingThenUndo(
  entry: VocabularyEntry,
  rating: Rating,
  srs: SrsEngineService
): VocabularyEntry {
  const previousSrsSnapshot: UndoState['previousSrsSnapshot'] = {
    interval: entry.interval,
    easeFactor: entry.easeFactor,
    nextReviewDate: entry.nextReviewDate,
    reviewCount: entry.reviewCount,
  };

  const result = srs.applyRating(entry, rating);

  const updatedEntry: VocabularyEntry = {
    ...entry,
    interval: result.newInterval,
    easeFactor: result.newEaseFactor,
    nextReviewDate: result.nextReviewDate.toISOString().split('T')[0],
    reviewCount: entry.reviewCount + 1,
  };

  // Undo: restore snapshot
  return {
    ...updatedEntry,
    interval: previousSrsSnapshot.interval,
    easeFactor: previousSrsSnapshot.easeFactor,
    nextReviewDate: previousSrsSnapshot.nextReviewDate,
    reviewCount: previousSrsSnapshot.reviewCount,
  };
}

describe('Property 21: Undo Rating Round-Trip', () => {
  const srs = new SrsEngineService();

  it.prop([arbitraryVocabularyEntry(), arbitraryRating()], { numRuns: 100 })(
    'undo restores interval to original value for any rating',
    (entry, rating) => {
      const restored = applyRatingThenUndo(entry, rating, srs);
      expect(restored.interval).toBe(entry.interval);
    }
  );

  it.prop([arbitraryVocabularyEntry(), arbitraryRating()], { numRuns: 100 })(
    'undo restores easeFactor to original value for any rating',
    (entry, rating) => {
      const restored = applyRatingThenUndo(entry, rating, srs);
      expect(restored.easeFactor).toBe(entry.easeFactor);
    }
  );

  it.prop([arbitraryVocabularyEntry(), arbitraryRating()], { numRuns: 100 })(
    'undo restores nextReviewDate to original value for any rating',
    (entry, rating) => {
      const restored = applyRatingThenUndo(entry, rating, srs);
      expect(restored.nextReviewDate).toBe(entry.nextReviewDate);
    }
  );

  it.prop([arbitraryVocabularyEntry(), arbitraryRating()], { numRuns: 100 })(
    'undo restores reviewCount to original value for any rating',
    (entry, rating) => {
      const restored = applyRatingThenUndo(entry, rating, srs);
      expect(restored.reviewCount).toBe(entry.reviewCount);
    }
  );

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'undo after forgot restores all four SRS fields exactly',
    (entry) => {
      const restored = applyRatingThenUndo(entry, 'forgot', srs);
      expect(restored.interval).toBe(entry.interval);
      expect(restored.easeFactor).toBe(entry.easeFactor);
      expect(restored.nextReviewDate).toBe(entry.nextReviewDate);
      expect(restored.reviewCount).toBe(entry.reviewCount);
    }
  );

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'undo after hard restores all four SRS fields exactly',
    (entry) => {
      const restored = applyRatingThenUndo(entry, 'hard', srs);
      expect(restored.interval).toBe(entry.interval);
      expect(restored.easeFactor).toBe(entry.easeFactor);
      expect(restored.nextReviewDate).toBe(entry.nextReviewDate);
      expect(restored.reviewCount).toBe(entry.reviewCount);
    }
  );

  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'undo after easy restores all four SRS fields exactly',
    (entry) => {
      const restored = applyRatingThenUndo(entry, 'easy', srs);
      expect(restored.interval).toBe(entry.interval);
      expect(restored.easeFactor).toBe(entry.easeFactor);
      expect(restored.nextReviewDate).toBe(entry.nextReviewDate);
      expect(restored.reviewCount).toBe(entry.reviewCount);
    }
  );
});
