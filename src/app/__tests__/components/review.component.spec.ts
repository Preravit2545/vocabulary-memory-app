/**
 * Unit tests for ReviewComponent
 * Validates: Requirements 2.3, 2.10, 2.11
 */

// Enable JIT compilation for Angular decorators in the test environment
import '@angular/compiler';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEnvironmentInjector,
  runInInjectionContext,
  EnvironmentInjector,
  signal,
} from '@angular/core';
import { ReviewComponent } from '../../components/review/review.component';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { SrsEngineService } from '../../services/srs-engine.service';
import { VocabularyEntry, SRSResult } from '../../models/vocabulary-entry.model';

// Mock the db module so rate() doesn't hit IndexedDB
vi.mock('../../db/vocab-memory-db', () => ({
  db: {
    reviewSessions: {
      add: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: 'entry-1',
    word: 'serendipity',
    translation: 'a happy accident',
    originalSentence: 'It was pure serendipity.',
    mnemonic: 'Serendip + ity = happy discovery',
    exampleSentences: ['She found the book by serendipity.'],
    synonyms: ['luck', 'chance'],
    antonyms: [],
    interval: 1,
    easeFactor: 2.5,
    nextReviewDate: today,
    reviewCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSrsResult(): SRSResult {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return { newInterval: 1, newEaseFactor: 2.5, nextReviewDate: next };
}

// ── test suite ────────────────────────────────────────────────────────────────

describe('ReviewComponent', () => {
  let component: ReviewComponent;
  let mockVocabStore: Partial<VocabularyStoreService>;
  let mockSrsEngine: Partial<SrsEngineService>;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    mockVocabStore = {
      getDueEntries: vi.fn().mockResolvedValue([]),
      updateEntry: vi.fn().mockResolvedValue(undefined),
      entries: signal([]) as any,
    };

    mockSrsEngine = {
      applyRating: vi.fn().mockReturnValue(makeSrsResult()),
    };

    injector = createEnvironmentInjector([
      { provide: VocabularyStoreService, useValue: mockVocabStore },
      { provide: SrsEngineService, useValue: mockSrsEngine },
    ]);

    component = runInInjectionContext(injector, () => new ReviewComponent());
  });

  // ── 1. Empty deck state ─────────────────────────────────────────────────────

  /**
   * Validates: Requirement 2.3
   * When getDueEntries returns an empty array, the deck signal should be empty
   * and the component should reflect the "no cards due" state.
   */
  it('shows empty deck state when no entries are due for review', async () => {
    (mockVocabStore.getDueEntries as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await component.loadDeck();

    expect(component.deck()).toHaveLength(0);
    expect(component.isLoading()).toBe(false);
    expect(component.isComplete()).toBe(false);
  });

  // ── 2. Reveal shows enrichment context ─────────────────────────────────────

  /**
   * Validates: Requirement 2.10
   * When reveal() is called, isRevealed becomes true and the current card's
   * mnemonic and originalSentence are accessible via currentCard.
   */
  it('sets isRevealed to true and exposes mnemonic and originalSentence after reveal', async () => {
    const entry = makeEntry({
      mnemonic: 'Serendip + ity = happy discovery',
      originalSentence: 'It was pure serendipity.',
    });

    (mockVocabStore.getDueEntries as ReturnType<typeof vi.fn>).mockResolvedValue([entry]);

    await component.loadDeck();

    expect(component.isRevealed()).toBe(false);

    component.reveal();

    expect(component.isRevealed()).toBe(true);
    expect(component.currentCard?.mnemonic).toBe('Serendip + ity = happy discovery');
    expect(component.currentCard?.originalSentence).toBe('It was pure serendipity.');
  });

  // ── 3. Session summary after last card ─────────────────────────────────────

  /**
   * Validates: Requirements 2.11
   * After rating the last (and only) card, isComplete should become true,
   * indicating the session summary should be shown.
   */
  it('sets isComplete to true after rating the last card in the deck', async () => {
    const entry = makeEntry();

    (mockVocabStore.getDueEntries as ReturnType<typeof vi.fn>).mockResolvedValue([entry]);

    await component.loadDeck();

    expect(component.isComplete()).toBe(false);

    await component.rate('easy');

    expect(component.isComplete()).toBe(true);
  });

  // ── 4. Session stats are updated after rating ───────────────────────────────

  /**
   * Validates: Requirement 2.11
   * After rating a card, the sessionStats signal should reflect the rating.
   */
  it('updates sessionStats correctly after each rating', async () => {
    const entries = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' }), makeEntry({ id: 'e3' })];

    (mockVocabStore.getDueEntries as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    await component.loadDeck();

    await component.rate('forgot');
    await component.rate('hard');
    await component.rate('easy');

    const stats = component.sessionStats();
    expect(stats.forgot).toBe(1);
    expect(stats.hard).toBe(1);
    expect(stats.easy).toBe(1);
    expect(component.isComplete()).toBe(true);
  });

  // ── 5. isRevealed resets between cards ─────────────────────────────────────

  /**
   * Validates: Requirement 2.10
   * After rating a non-last card, isRevealed should reset to false for the next card.
   */
  it('resets isRevealed to false after advancing to the next card', async () => {
    const entries = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })];

    (mockVocabStore.getDueEntries as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    await component.loadDeck();

    component.reveal();
    expect(component.isRevealed()).toBe(true);

    await component.rate('easy');

    expect(component.isRevealed()).toBe(false);
    expect(component.currentIndex()).toBe(1);
  });

  // ── Undo behavior ─────────────────────────────────────────────────────────

  /**
   * Validates: Requirements 10.1, 10.5
   * Before any rating is submitted, undoState should be null (Undo button hidden).
   */
  it('undo button is hidden before first rating (undoState is null)', async () => {
    const entry = makeEntry();
    (mockVocabStore.getDueEntries as ReturnType<typeof vi.fn>).mockResolvedValue([entry]);

    await component.loadDeck();

    expect(component.undoState()).toBeNull();
  });

  /**
   * Validates: Requirements 10.1, 10.3
   * After submitting a rating, undoState should be non-null (Undo button visible).
   */
  it('undo button is visible after rating (undoState is non-null)', async () => {
    const entries = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })];
    (mockVocabStore.getDueEntries as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    await component.loadDeck();

    expect(component.undoState()).toBeNull();

    await component.rate('easy');

    expect(component.undoState()).not.toBeNull();
  });

  /**
   * Validates: Requirements 10.3, 10.4
   * After tapping Undo, undoState should be cleared (Undo button hidden again).
   */
  it('undo button is hidden after undo (undoState cleared)', async () => {
    const entries = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })];
    (mockVocabStore.getDueEntries as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    await component.loadDeck();

    await component.rate('hard');
    expect(component.undoState()).not.toBeNull();

    await component.undo();

    expect(component.undoState()).toBeNull();
  });

  /**
   * Validates: Requirements 10.2, 10.4
   * After undo, the SRS state of the entry should be reverted to its pre-rating values.
   */
  it('SRS state is correctly reverted after undo', async () => {
    const originalInterval = 5;
    const originalEaseFactor = 2.3;
    const originalNextReviewDate = '2024-01-10';
    const originalReviewCount = 3;

    const entry = makeEntry({
      id: 'e1',
      interval: originalInterval,
      easeFactor: originalEaseFactor,
      nextReviewDate: originalNextReviewDate,
      reviewCount: originalReviewCount,
    });
    const entries = [entry, makeEntry({ id: 'e2' })];

    (mockVocabStore.getDueEntries as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    await component.loadDeck();

    await component.rate('forgot');

    // Verify undoState captured the original SRS snapshot
    const undoState = component.undoState();
    expect(undoState).not.toBeNull();
    expect(undoState!.previousSrsSnapshot.interval).toBe(originalInterval);
    expect(undoState!.previousSrsSnapshot.easeFactor).toBe(originalEaseFactor);
    expect(undoState!.previousSrsSnapshot.nextReviewDate).toBe(originalNextReviewDate);
    expect(undoState!.previousSrsSnapshot.reviewCount).toBe(originalReviewCount);

    await component.undo();

    // After undo, the deck entry should have the original SRS values restored
    const revertedCard = component.deck()[0];
    expect(revertedCard.interval).toBe(originalInterval);
    expect(revertedCard.easeFactor).toBe(originalEaseFactor);
    expect(revertedCard.nextReviewDate).toBe(originalNextReviewDate);
    expect(revertedCard.reviewCount).toBe(originalReviewCount);

    // updateEntry should have been called with the original snapshot to persist the revert
    expect(mockVocabStore.updateEntry).toHaveBeenLastCalledWith('e1', {
      interval: originalInterval,
      easeFactor: originalEaseFactor,
      nextReviewDate: originalNextReviewDate,
      reviewCount: originalReviewCount,
    });

    // Component should return to the rated card
    expect(component.currentIndex()).toBe(0);
    expect(component.isRevealed()).toBe(true);
  });
});
