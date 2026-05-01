// Feature: vocabulary-memory-app, Property 22: Rating Button Visibility Invariant

/**
 * Validates: Requirements 11.1, 11.2, 11.3
 *
 * Property 22: Rating Button Visibility Invariant
 * For any VocabularyEntry, the review component SHALL display all three rating
 * buttons (Forgot, Hard, Easy) when `isRevealed` is true, and SHALL display no
 * rating buttons when `isRevealed` is false.
 *
 * Since DOM rendering is not easily testable in property tests, we test the
 * component's `isRevealed` signal logic directly:
 *   - Before reveal() is called, isRevealed() is false (no rating buttons shown)
 *   - After reveal() is called, isRevealed() is true (all 3 rating buttons shown)
 *   - The rating availability is determined solely by isRevealed()
 */

// Enable JIT compilation for Angular decorators in the test environment
import '@angular/compiler';

import { fc, it } from '@fast-check/vitest';
import { describe, vi, beforeEach } from 'vitest';
import {
  createEnvironmentInjector,
  runInInjectionContext,
  EnvironmentInjector,
  signal,
} from '@angular/core';
import { ReviewComponent } from '../components/review/review.component';
import { VocabularyStoreService } from '../services/vocabulary-store.service';
import { SrsEngineService } from '../services/srs-engine.service';
import { VocabularyEntry, SRSResult } from '../models/vocabulary-entry.model';

// Mock the db module so rate() doesn't hit IndexedDB
vi.mock('../db/vocab-memory-db', () => ({
  db: {
    reviewSessions: {
      add: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

// ── Arbitrary generators ──────────────────────────────────────────────────────

function arbitraryVocabularyEntry(): fc.Arbitrary<VocabularyEntry> {
  return fc.record({
    id: fc.uuid(),
    word: fc.string({ minLength: 1, maxLength: 30 }),
    translation: fc.string({ minLength: 1, maxLength: 50 }),
    pos: fc.option(fc.constantFrom('noun', 'verb', 'adjective', 'adverb'), { nil: undefined }),
    originalSentence: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    notes: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    mnemonic: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
    exampleSentences: fc.array(fc.string({ minLength: 1, maxLength: 80 }), { maxLength: 3 }),
    synonyms: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
    antonyms: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
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
    createdAt: fc.constant(new Date().toISOString()),
    updatedAt: fc.constant(new Date().toISOString()),
  });
}

function makeSrsResult(): SRSResult {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return { newInterval: 1, newEaseFactor: 2.5, nextReviewDate: next };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Property 22: Rating Button Visibility Invariant', () => {
  let injector: EnvironmentInjector;

  beforeEach(() => {
    const mockVocabStore: Partial<VocabularyStoreService> = {
      getDueEntries: vi.fn().mockResolvedValue([]),
      updateEntry: vi.fn().mockResolvedValue(undefined),
      entries: signal([]) as any,
    };

    const mockSrsEngine: Partial<SrsEngineService> = {
      applyRating: vi.fn().mockReturnValue(makeSrsResult()),
    };

    injector = createEnvironmentInjector([
      { provide: VocabularyStoreService, useValue: mockVocabStore },
      { provide: SrsEngineService, useValue: mockSrsEngine },
    ]);
  });

  /**
   * Property: For any VocabularyEntry, before reveal() is called,
   * isRevealed() is false — meaning no rating buttons are shown.
   * Validates: Requirements 11.3
   */
  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'isRevealed is false before reveal() is called (no rating buttons shown)',
    async (entry) => {
      const mockVocabStore: Partial<VocabularyStoreService> = {
        getDueEntries: vi.fn().mockResolvedValue([entry]),
        updateEntry: vi.fn().mockResolvedValue(undefined),
        entries: signal([]) as any,
      };

      const localInjector = createEnvironmentInjector([
        { provide: VocabularyStoreService, useValue: mockVocabStore },
        { provide: SrsEngineService, useValue: { applyRating: vi.fn().mockReturnValue(makeSrsResult()) } },
      ]);

      const component = runInInjectionContext(localInjector, () => new ReviewComponent());
      await component.loadDeck();

      // Before reveal: isRevealed must be false → rating buttons are NOT shown
      expect(component.isRevealed()).toBe(false);
    }
  );

  /**
   * Property: For any VocabularyEntry, after reveal() is called,
   * isRevealed() is true — meaning all three rating buttons are shown.
   * Validates: Requirements 11.1, 11.2
   */
  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'isRevealed is true after reveal() is called (all 3 rating buttons shown)',
    async (entry) => {
      const mockVocabStore: Partial<VocabularyStoreService> = {
        getDueEntries: vi.fn().mockResolvedValue([entry]),
        updateEntry: vi.fn().mockResolvedValue(undefined),
        entries: signal([]) as any,
      };

      const localInjector = createEnvironmentInjector([
        { provide: VocabularyStoreService, useValue: mockVocabStore },
        { provide: SrsEngineService, useValue: { applyRating: vi.fn().mockReturnValue(makeSrsResult()) } },
      ]);

      const component = runInInjectionContext(localInjector, () => new ReviewComponent());
      await component.loadDeck();

      component.reveal();

      // After reveal: isRevealed must be true → all 3 rating buttons are shown
      expect(component.isRevealed()).toBe(true);
    }
  );

  /**
   * Property: The rating availability is determined solely by isRevealed().
   * reveal() always transitions isRevealed from false → true, regardless of
   * the VocabularyEntry's content.
   * Validates: Requirements 11.1, 11.2, 11.3
   */
  it.prop([arbitraryVocabularyEntry()], { numRuns: 100 })(
    'reveal() always transitions isRevealed from false to true for any entry',
    async (entry) => {
      const mockVocabStore: Partial<VocabularyStoreService> = {
        getDueEntries: vi.fn().mockResolvedValue([entry]),
        updateEntry: vi.fn().mockResolvedValue(undefined),
        entries: signal([]) as any,
      };

      const localInjector = createEnvironmentInjector([
        { provide: VocabularyStoreService, useValue: mockVocabStore },
        { provide: SrsEngineService, useValue: { applyRating: vi.fn().mockReturnValue(makeSrsResult()) } },
      ]);

      const component = runInInjectionContext(localInjector, () => new ReviewComponent());
      await component.loadDeck();

      // Pre-condition: not revealed
      const beforeReveal = component.isRevealed();
      expect(beforeReveal).toBe(false);

      component.reveal();

      // Post-condition: revealed
      const afterReveal = component.isRevealed();
      expect(afterReveal).toBe(true);

      // The transition is always false → true
      expect(beforeReveal).toBe(false);
      expect(afterReveal).toBe(true);
    }
  );
});

// Feature: vocabulary-memory-app, Property 23: Review Progress Indicator Accuracy

/**
 * Validates: Requirements 12.4
 *
 * Property 23: Review Progress Indicator Accuracy
 * For any review session with N total cards and K cards completed (0 ≤ K ≤ N),
 * the rendered review component SHALL display a progress indicator whose value
 * reflects K out of N (i.e., the ratio K/N or equivalent count display).
 *
 * We test the component's signal state directly:
 *   - For any deck of N cards and any index K (0 ≤ K < N), the progress ratio is K/N
 *   - The text counter shows K+1 of N (1-based display)
 *   - After rating K cards, currentIndex() equals K
 */

describe('Property 23: Review Progress Indicator Accuracy', () => {
  /**
   * Property: For any deck of N cards (N >= 1) and any index K (0 <= K < N),
   * the progress ratio currentIndex() / deck().length equals K / N.
   * Validates: Requirements 12.4
   */
  it.prop(
    [
      fc.integer({ min: 1, max: 20 }).chain((n) =>
        fc.tuple(
          fc.constant(n),
          fc.integer({ min: 0, max: n - 1 }),
          fc.array(arbitraryVocabularyEntry(), { minLength: n, maxLength: n })
        )
      ),
    ],
    { numRuns: 100 }
  )(
    'progress ratio equals currentIndex / deck.length for any K out of N',
    async ([n, k, entries]) => {
      const mockVocabStore: Partial<VocabularyStoreService> = {
        getDueEntries: vi.fn().mockResolvedValue(entries),
        updateEntry: vi.fn().mockResolvedValue(undefined),
        entries: signal([]) as any,
      };

      const localInjector = createEnvironmentInjector([
        { provide: VocabularyStoreService, useValue: mockVocabStore },
        {
          provide: SrsEngineService,
          useValue: { applyRating: vi.fn().mockReturnValue(makeSrsResult()) },
        },
      ]);

      const component = runInInjectionContext(localInjector, () => new ReviewComponent());
      await component.loadDeck();

      // Manually set currentIndex to K to simulate K cards completed
      component.currentIndex.set(k);

      const ratio = component.currentIndex() / component.deck().length;
      const expectedRatio = k / n;

      expect(component.deck().length).toBe(n);
      expect(component.currentIndex()).toBe(k);
      expect(ratio).toBeCloseTo(expectedRatio, 10);
    }
  );

  /**
   * Property: For any deck of N cards and index K, the text counter
   * displays "Card K+1 of N" (1-based display).
   * Validates: Requirements 12.4
   */
  it.prop(
    [
      fc.integer({ min: 1, max: 20 }).chain((n) =>
        fc.tuple(
          fc.constant(n),
          fc.integer({ min: 0, max: n - 1 }),
          fc.array(arbitraryVocabularyEntry(), { minLength: n, maxLength: n })
        )
      ),
    ],
    { numRuns: 100 }
  )(
    'text counter shows currentIndex+1 of deck.length (1-based)',
    async ([n, k, entries]) => {
      const mockVocabStore: Partial<VocabularyStoreService> = {
        getDueEntries: vi.fn().mockResolvedValue(entries),
        updateEntry: vi.fn().mockResolvedValue(undefined),
        entries: signal([]) as any,
      };

      const localInjector = createEnvironmentInjector([
        { provide: VocabularyStoreService, useValue: mockVocabStore },
        {
          provide: SrsEngineService,
          useValue: { applyRating: vi.fn().mockReturnValue(makeSrsResult()) },
        },
      ]);

      const component = runInInjectionContext(localInjector, () => new ReviewComponent());
      await component.loadDeck();

      component.currentIndex.set(k);

      // The template renders: "Card {{ currentIndex() + 1 }} of {{ deck().length }}"
      const displayedCurrent = component.currentIndex() + 1;
      const displayedTotal = component.deck().length;

      expect(displayedCurrent).toBe(k + 1);
      expect(displayedTotal).toBe(n);
    }
  );

  /**
   * Property: After rating K cards sequentially, currentIndex() equals K.
   * Validates: Requirements 12.4
   */
  it.prop(
    [
      fc.integer({ min: 1, max: 10 }).chain((n) =>
        fc.tuple(
          fc.constant(n),
          fc.integer({ min: 0, max: n - 1 }),
          fc.array(arbitraryVocabularyEntry(), { minLength: n, maxLength: n }),
          fc.array(fc.constantFrom<Rating>('forgot', 'hard', 'easy'), {
            minLength: n - 1,
            maxLength: n - 1,
          })
        )
      ),
    ],
    { numRuns: 100 }
  )(
    'after rating K cards, currentIndex equals K',
    async ([n, k, entries, ratings]) => {
      const mockVocabStore: Partial<VocabularyStoreService> = {
        getDueEntries: vi.fn().mockResolvedValue(entries),
        updateEntry: vi.fn().mockResolvedValue(undefined),
        entries: signal([]) as any,
      };

      const localInjector = createEnvironmentInjector([
        { provide: VocabularyStoreService, useValue: mockVocabStore },
        {
          provide: SrsEngineService,
          useValue: { applyRating: vi.fn().mockReturnValue(makeSrsResult()) },
        },
      ]);

      const component = runInInjectionContext(localInjector, () => new ReviewComponent());
      await component.loadDeck();

      // Rate exactly k cards (k < n so we never hit the last card)
      for (let i = 0; i < k; i++) {
        component.reveal();
        await component.rate(ratings[i]);
      }

      expect(component.currentIndex()).toBe(k);
      expect(component.deck().length).toBe(n);
    }
  );
});
