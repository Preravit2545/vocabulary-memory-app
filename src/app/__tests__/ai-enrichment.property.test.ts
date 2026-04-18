// Feature: vocabulary-memory-app, Property 15: Enrichment Fields Persistence Round-Trip
// Feature: vocabulary-memory-app, Property 16: Enrichment Review Form Completeness
// Feature: vocabulary-memory-app, Property 17: Partial Enrichment Graceful Display
// Feature: vocabulary-memory-app, Property 18: Flashcard Reveals Enrichment Context

import '@angular/compiler';

import { fc, it } from '@fast-check/vitest';
import { vi } from 'vitest';
import { createEnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { VocabularyEntry, AIEnrichmentResult } from '../models/vocabulary-entry.model';
import { AddWordComponent } from '../components/add-word/add-word.component';
import { ReviewComponent } from '../components/review/review.component';
import { VocabularyStoreService } from '../services/vocabulary-store.service';
import { AiService } from '../services/ai.service';
import { SrsEngineService } from '../services/srs-engine.service';

// Mock the db module so rate() doesn't hit IndexedDB
vi.mock('../../db/vocab-memory-db', () => ({
  db: {
    reviewSessions: {
      add: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

// ── Property 15 arbitraries ───────────────────────────────────────────────────

const arbitraryEnrichedEntry = fc.record({
  id: fc.uuid(),
  word: fc.stringMatching(/^[a-z]{3,10}$/),
  translation: fc.string({ minLength: 1, maxLength: 100 }),
  originalSentence: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  notes: fc.constant(undefined),
  exampleSentences: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
  synonyms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  antonyms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  mnemonic: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  interval: fc.integer({ min: 1, max: 365 }),
  easeFactor: fc.double({ min: 1.3, max: 4.0, noNaN: true }),
  nextReviewDate: fc.constant('2025-01-01'),
  reviewCount: fc.integer({ min: 0, max: 1000 }),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString()),
});

/**
 * Validates: Requirements 7.7
 *
 * Property 15: Enrichment Fields Persistence Round-Trip
 */
describe('AI Enrichment — Property 15: Enrichment Fields Persistence Round-Trip', () => {
  it.prop([arbitraryEnrichedEntry], { numRuns: 100 })(
    'all enrichment fields survive a JSON serialization round-trip (as IndexedDB does)',
    (entry: VocabularyEntry) => {
      const serialized = JSON.stringify(entry);
      const retrieved: VocabularyEntry = JSON.parse(serialized);

      expect(retrieved.id).toBe(entry.id);
      expect(retrieved.translation).toBe(entry.translation);
      expect(retrieved.synonyms).toEqual(entry.synonyms);
      expect(retrieved.antonyms).toEqual(entry.antonyms);
      expect(retrieved.exampleSentences).toEqual(entry.exampleSentences);

      if (entry.mnemonic !== undefined) {
        expect(retrieved.mnemonic).toBe(entry.mnemonic);
      } else {
        expect(retrieved.mnemonic).toBeUndefined();
      }

      if (entry.originalSentence !== undefined) {
        expect(retrieved.originalSentence).toBe(entry.originalSentence);
      } else {
        expect(retrieved.originalSentence).toBeUndefined();
      }
    }
  );
});

// ── Property 16 arbitraries ───────────────────────────────────────────────────

const arbitraryEnrichmentResult = fc.record({
  translation: fc.string({ minLength: 1, maxLength: 100 }),
  synonyms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
  antonyms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
  mnemonic: fc.string({ minLength: 1, maxLength: 200 }),
  exampleSentences: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
});

/**
 * Validates: Requirements 7.6
 *
 * Property 16: Enrichment Review Form Completeness
 */
describe('AI Enrichment — Property 16: Enrichment Review Form Completeness', () => {
  it.prop([arbitraryEnrichmentResult], { numRuns: 100 })(
    'all four enrichment field signals are populated after enrichWithAI() resolves with a non-null result',
    async (enrichmentResult: AIEnrichmentResult) => {
      const mockVocabStore: Partial<VocabularyStoreService> = {
        findByWord: () => Promise.resolve(undefined),
        addEntry: () => Promise.resolve(undefined as any),
      };

      const mockAiService: Partial<AiService> = {
        enrichVocabulary: () => Promise.resolve(enrichmentResult),
      };

      const injector = createEnvironmentInjector([
        { provide: VocabularyStoreService, useValue: mockVocabStore },
        { provide: AiService, useValue: mockAiService },
      ]);

      const component = runInInjectionContext(injector, () => new AddWordComponent());
      component.word.set('testword');

      await component.enrichWithAI();

      expect(component.translation()).toBe(enrichmentResult.translation);
      expect(component.synonyms()).toEqual(enrichmentResult.synonyms);
      expect(component.antonyms()).toEqual(enrichmentResult.antonyms);
      expect(component.mnemonic()).toBe(enrichmentResult.mnemonic);
    }
  );
});

// ── Property 17 arbitraries ───────────────────────────────────────────────────

const arbitraryPartialEnrichmentResult = fc.record({
  translation: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 100 })),
  synonyms: fc.oneof(fc.constant([]), fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 })),
  antonyms: fc.oneof(fc.constant([]), fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 })),
  mnemonic: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 200 })),
  exampleSentences: fc.oneof(fc.constant([]), fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 })),
  partialError: fc.string({ minLength: 1, maxLength: 100 }),
});

/**
 * Validates: Requirements 7.8
 *
 * Property 17: Partial Enrichment Graceful Display
 */
describe('AI Enrichment — Property 17: Partial Enrichment Graceful Display', () => {
  it.prop([arbitraryPartialEnrichmentResult], { numRuns: 100 })(
    'partial enrichment result is stored without crashing, error signal is set, available fields are populated, and save is not blocked',
    async (partialResult: AIEnrichmentResult) => {
      const mockVocabStore: Partial<VocabularyStoreService> = {
        findByWord: () => Promise.resolve(undefined),
        addEntry: () => Promise.resolve(undefined as any),
      };

      const mockAiService: Partial<AiService> = {
        enrichVocabulary: () => Promise.resolve(partialResult),
      };

      const injector = createEnvironmentInjector([
        { provide: VocabularyStoreService, useValue: mockVocabStore },
        { provide: AiService, useValue: mockAiService },
      ]);

      const component = runInInjectionContext(injector, () => new AddWordComponent());
      component.word.set('testword');

      await component.enrichWithAI();

      expect(component.enrichment()).not.toBeNull();
      expect(component.enrichment()).toEqual(partialResult);
      expect(component.error()).toBe(partialResult.partialError);
      expect(component.translation()).toBe(partialResult.translation);
      expect(component.synonyms()).toEqual(partialResult.synonyms);
      expect(component.antonyms()).toEqual(partialResult.antonyms);
      expect(component.mnemonic()).toBe(partialResult.mnemonic);
      expect(component.exampleSentences()).toEqual(partialResult.exampleSentences);
      expect(component.word().trim()).toBeTruthy();
      expect(component.isSaving()).toBe(false);
    }
  );
});

// ── Property 18 arbitraries ───────────────────────────────────────────────────

const arbitraryEntryWithEnrichment = fc.record({
  id: fc.uuid(),
  word: fc.stringMatching(/^[a-z]{3,10}$/),
  translation: fc.string({ minLength: 1, maxLength: 100 }),
  originalSentence: fc.string({ minLength: 1, maxLength: 200 }),
  mnemonic: fc.string({ minLength: 1, maxLength: 200 }),
  notes: fc.constant(undefined),
  exampleSentences: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
  synonyms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  antonyms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  interval: fc.integer({ min: 1, max: 365 }),
  easeFactor: fc.double({ min: 1.3, max: 4.0, noNaN: true }),
  nextReviewDate: fc.constant(new Date().toISOString().split('T')[0]),
  reviewCount: fc.integer({ min: 0, max: 1000 }),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString()),
});

/**
 * Validates: Requirements 7.9
 *
 * Property 18: Flashcard Reveals Enrichment Context
 */
describe('AI Enrichment — Property 18: Flashcard Reveals Enrichment Context', () => {
  it.prop([arbitraryEntryWithEnrichment], { numRuns: 100 })(
    'after loadDeck() and reveal(), currentCard exposes the mnemonic and originalSentence from the entry',
    async (entry: VocabularyEntry) => {
      const mockVocabStore: Partial<VocabularyStoreService> = {
        getDueEntries: vi.fn().mockResolvedValue([entry]),
        updateEntry: vi.fn().mockResolvedValue(undefined),
        entries: signal([]) as any,
      };

      const mockSrsEngine: Partial<SrsEngineService> = {
        applyRating: vi.fn().mockReturnValue({
          newInterval: 1,
          newEaseFactor: 2.5,
          nextReviewDate: new Date(),
        }),
      };

      const injector = createEnvironmentInjector([
        { provide: VocabularyStoreService, useValue: mockVocabStore },
        { provide: SrsEngineService, useValue: mockSrsEngine },
      ]);

      const component = runInInjectionContext(injector, () => new ReviewComponent());

      await component.loadDeck();

      expect(component.currentCard).not.toBeNull();
      expect(component.isRevealed()).toBe(false);

      component.reveal();

      expect(component.isRevealed()).toBe(true);
      expect(component.currentCard?.mnemonic).toBe(entry.mnemonic);
      expect(component.currentCard?.originalSentence).toBe(entry.originalSentence);
    }
  );
});
