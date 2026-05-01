/**
 * Unit tests for AddWordComponent
 * Validates: Requirements 1.4, 1.6, 1.7
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
import { AddWordComponent } from '../../components/add-word/add-word.component';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { AiService } from '../../services/ai.service';
import { AIEnrichmentResult, VocabularyEntry } from '../../models/vocabulary-entry.model';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEntry(word: string): VocabularyEntry {
  return {
    id: 'test-id',
    word,
    translation: 'test translation',
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

// ── test suite ────────────────────────────────────────────────────────────────

describe('AddWordComponent', () => {
  let component: AddWordComponent;
  let mockVocabStore: Partial<VocabularyStoreService>;
  let mockAiService: Partial<AiService>;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    mockVocabStore = {
      findByWord: vi.fn().mockResolvedValue(undefined),
      addEntry: vi.fn().mockResolvedValue(undefined),
      findBySynonymOverlap: vi.fn().mockResolvedValue([]),
      entries: signal([]) as any,
    };

    mockAiService = {
      enrichVocabulary: vi.fn().mockResolvedValue({
        translation: '',
        synonyms: [],
        antonyms: [],
        mnemonic: '',
        exampleSentences: [],
      } satisfies AIEnrichmentResult),
      regenerateMnemonic: vi.fn().mockResolvedValue({ mnemonic: '' }),
    };

    injector = createEnvironmentInjector([
      { provide: VocabularyStoreService, useValue: mockVocabStore },
      { provide: AiService, useValue: mockAiService },
    ]);

    component = runInInjectionContext(injector, () => new AddWordComponent());
  });

  // ── 1. Duplicate warning ────────────────────────────────────────────────────

  /**
   * Validates: Requirement 1.4
   * When findByWord returns an existing entry, saveEntry() should set
   * duplicateWarning to true so the template can show the warning.
   */
  it('shows duplicate warning when the word already exists in the collection', async () => {
    (mockVocabStore.findByWord as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeEntry('hello')
    );

    component.word.set('hello');
    await component.saveEntry();

    expect(component.duplicateEntry()).not.toBeNull();
    // addEntry should NOT have been called
    expect(mockVocabStore.addEntry).not.toHaveBeenCalled();
  });

  // ── 2. AI enrichment result stored in signal ────────────────────────────────

  /**
   * Validates: Requirement 1.6
   * When AiService.enrichVocabulary resolves successfully, the enrichment
   * result should be stored in the component's enrichment signal and the
   * individual editable fields should be populated.
   */
  it('stores AI enrichment result in the enrichment signal after successful enrichment', async () => {
    const enrichmentResult: AIEnrichmentResult = {
      translation: 'สวัสดี',
      synonyms: ['hi', 'greetings'],
      antonyms: ['goodbye'],
      mnemonic: 'Think of waving hello',
      exampleSentences: ['Hello, world!', 'She said hello.'],
    };

    (mockAiService.enrichVocabulary as ReturnType<typeof vi.fn>).mockResolvedValue(
      enrichmentResult
    );

    component.word.set('hello');
    await component.enrichWithAI();

    expect(component.enrichment()).toEqual(enrichmentResult);
    expect(component.translation()).toBe('สวัสดี');
    expect(component.synonyms()).toEqual(['hi', 'greetings']);
    expect(component.antonyms()).toEqual(['goodbye']);
    expect(component.mnemonic()).toBe('Think of waving hello');
    expect(component.exampleSentences()).toEqual(['Hello, world!', 'She said hello.']);
  });

  // ── 3. Save without AI content uses default SRS values ─────────────────────

  /**
   * Validates: Requirement 1.7
   * When saving a word without AI enrichment, addEntry should be called with
   * interval=1 and easeFactor=2.5 (initial SRS defaults).
   */
  it('calls addEntry with interval=1 and easeFactor=2.5 when saving without AI content', async () => {
    component.word.set('serendipity');

    await component.saveEntry();

    expect(mockVocabStore.addEntry).toHaveBeenCalledOnce();
    const callArg = (mockVocabStore.addEntry as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.interval).toBe(1);
    expect(callArg.easeFactor).toBe(2.5);
    expect(callArg.word).toBe('serendipity');
  });

  // ── 4. Partial AI error still allows saving ─────────────────────────────────

  /**
   * Validates: Requirement 1.6
   * When AiService returns a partialError (e.g. timeout), the component should
   * still allow the user to save the entry — the error is surfaced but does not
   * block the save flow.
   */
  it('allows saving after AI enrichment returns a partialError', async () => {
    const partialResult: AIEnrichmentResult = {
      translation: '',
      synonyms: [],
      antonyms: [],
      mnemonic: '',
      exampleSentences: [],
      partialError: 'AI service timed out',
    };

    (mockAiService.enrichVocabulary as ReturnType<typeof vi.fn>).mockResolvedValue(
      partialResult
    );

    component.word.set('ephemeral');
    await component.enrichWithAI();

    // Error message is set from partialError
    expect(component.error()).toBe('AI service timed out');
    // enrichment signal is still populated (partial result stored)
    expect(component.enrichment()).toEqual(partialResult);

    // User can still save — proceed to save
    await component.saveEntry();

    expect(mockVocabStore.addEntry).toHaveBeenCalledOnce();
    const callArg = (mockVocabStore.addEntry as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.word).toBe('ephemeral');
  });

  // ── 5. Regenerate mnemonic — success ────────────────────────────────────────

  /**
   * Validates: Requirement 14.6
   * When the user clicks "Regenerate Mnemonic", AiService.regenerateMnemonic()
   * should be called with the current word and translation, and the mnemonic
   * field should be updated with the returned value.
   */
  it('calls regenerateMnemonic and updates mnemonic field on success', async () => {
    mockAiService.regenerateMnemonic = vi.fn().mockResolvedValue({
      mnemonic: 'ริ-ลัค-เทิ่นท์ — นึกถึงคนที่ไม่อยากทำอะไร',
    });

    component.word.set('reluctant');
    component.translation.set('ไม่เต็มใจ');
    // Set enrichment so the regenerate button is visible (enrichment !== null)
    component.enrichment.set({
      translation: 'ไม่เต็มใจ',
      synonyms: [],
      antonyms: [],
      mnemonic: 'old mnemonic',
      exampleSentences: [],
    });

    await component.regenerateMnemonic();

    expect(mockAiService.regenerateMnemonic).toHaveBeenCalledWith('reluctant', 'ไม่เต็มใจ');
    expect(component.mnemonic()).toBe('ริ-ลัค-เทิ่นท์ — นึกถึงคนที่ไม่อยากทำอะไร');
    expect(component.isRegeneratingMnemonic()).toBe(false);
  });

  // ── 6. Regenerate mnemonic — error shows error message ──────────────────────

  /**
   * Validates: Requirement 14.6
   * When AiService.regenerateMnemonic() throws, the component should display
   * an error message (via the error signal) and not crash.
   */
  it('shows error message when regenerateMnemonic fails', async () => {
    mockAiService.regenerateMnemonic = vi.fn().mockRejectedValue(
      new Error('Network error')
    );

    component.word.set('ephemeral');
    component.translation.set('ชั่วคราว');
    component.enrichment.set({
      translation: 'ชั่วคราว',
      synonyms: [],
      antonyms: [],
      mnemonic: 'existing mnemonic',
      exampleSentences: [],
    });
    component.mnemonic.set('existing mnemonic');

    await component.regenerateMnemonic();

    expect(component.error()).toBe('Network error');
    // mnemonic should remain unchanged on failure
    expect(component.mnemonic()).toBe('existing mnemonic');
    expect(component.isRegeneratingMnemonic()).toBe(false);
  });

  // ── 7. Regenerate mnemonic — placeholder when AI returns empty ───────────────

  /**
   * Validates: Requirement 14.5
   * When AiService.regenerateMnemonic() returns an empty mnemonic string,
   * the component should display the placeholder text encouraging the user
   * to write their own mnemonic.
   */
  it('shows placeholder when AI returns empty mnemonic on regenerate', async () => {
    mockAiService.regenerateMnemonic = vi.fn().mockResolvedValue({ mnemonic: '' });

    component.word.set('serendipity');
    component.translation.set('โชคดีที่ไม่คาดฝัน');
    component.enrichment.set({
      translation: 'โชคดีที่ไม่คาดฝัน',
      synonyms: [],
      antonyms: [],
      mnemonic: '',
      exampleSentences: [],
    });

    await component.regenerateMnemonic();

    expect(component.mnemonic()).toBe('เขียน mnemonic ของคุณเองที่นี่');
    expect(component.isRegeneratingMnemonic()).toBe(false);
  });

  // ── 8. isRegeneratingMnemonic is true during regeneration ───────────────────

  /**
   * Validates: Requirement 14.6
   * The isRegeneratingMnemonic signal should be true while the regeneration
   * is in progress and false after it completes.
   */
  it('sets isRegeneratingMnemonic to true during regeneration and false after', async () => {
    let resolveRegenerate!: (value: { mnemonic: string }) => void;
    const pendingPromise = new Promise<{ mnemonic: string }>((resolve) => {
      resolveRegenerate = resolve;
    });

    mockAiService.regenerateMnemonic = vi.fn().mockReturnValue(pendingPromise);

    component.word.set('test');
    component.translation.set('ทดสอบ');
    component.enrichment.set({
      translation: 'ทดสอบ',
      synonyms: [],
      antonyms: [],
      mnemonic: '',
      exampleSentences: [],
    });

    const regeneratePromise = component.regenerateMnemonic();

    // Should be true while awaiting
    expect(component.isRegeneratingMnemonic()).toBe(true);

    resolveRegenerate({ mnemonic: 'new mnemonic' });
    await regeneratePromise;

    // Should be false after completion
    expect(component.isRegeneratingMnemonic()).toBe(false);
  });
});
