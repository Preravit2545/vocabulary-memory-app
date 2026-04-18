/**
 * Unit tests for DashboardComponent
 * Validates: Requirements 3.2, 3.5, 3.7
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
import { DashboardComponent } from '../../components/dashboard/dashboard.component';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { VocabularyEntry } from '../../models/vocabulary-entry.model';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: 'entry-1',
    word: 'serendipity',
    translation: 'a happy accident',
    exampleSentences: [],
    synonyms: [],
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

// ── test suite ────────────────────────────────────────────────────────────────

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let mockVocabStore: Partial<VocabularyStoreService>;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    mockVocabStore = {
      entries: signal([]) as any,
      deleteEntry: vi.fn().mockResolvedValue(undefined),
      updateEntry: vi.fn().mockResolvedValue(undefined),
    };

    injector = createEnvironmentInjector([
      { provide: VocabularyStoreService, useValue: mockVocabStore },
    ]);

    component = runInInjectionContext(injector, () => new DashboardComponent());
  });

  // ── 1. Search debounce — signal update ─────────────────────────────────────

  /**
   * Validates: Requirement 3.2
   * When setSearch (onSearchInput) is called, rawSearchInput should update
   * immediately. The searchTerm signal is debounced but can be set directly
   * to test the filtering logic.
   */
  it('updates rawSearchInput immediately when onSearchInput is called', () => {
    component.onSearchInput('hello');

    expect(component.rawSearchInput()).toBe('hello');
  });

  it('updates searchTerm signal when set directly', () => {
    component.searchTerm.set('world');

    expect(component.searchTerm()).toBe('world');
  });

  // ── 2. Filter switching ─────────────────────────────────────────────────────

  /**
   * Validates: Requirement 3.5
   * When filterStatus is set to different values, filteredEntries should
   * reflect the correct subset of entries.
   */
  it('starts with filterStatus "all"', () => {
    expect(component.filterStatus()).toBe('all');
  });

  it('updates filterStatus signal when setFilter is called', () => {
    component.filterStatus.set('due-today');

    expect(component.filterStatus()).toBe('due-today');
  });

  it('filteredEntries returns all entries when filterStatus is "all"', () => {
    const entries = [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2', word: 'ephemeral' })];
    (mockVocabStore.entries as any).set(entries);

    expect(component.filteredEntries()).toHaveLength(2);
  });

  it('filteredEntries returns only mastered entries when filterStatus is "mastered"', () => {
    const today = new Date().toISOString().split('T')[0];
    const entries = [
      makeEntry({ id: 'e1', interval: 5 }),   // not mastered
      makeEntry({ id: 'e2', interval: 21 }),  // mastered
      makeEntry({ id: 'e3', interval: 30 }),  // mastered
    ];
    (mockVocabStore.entries as any).set(entries);

    component.filterStatus.set('mastered');

    const result = component.filteredEntries();
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.interval >= 21)).toBe(true);
  });

  it('filteredEntries returns only hard entries when filterStatus is "hard"', () => {
    const entries = [
      makeEntry({ id: 'e1', easeFactor: 1.5 }),  // hard
      makeEntry({ id: 'e2', easeFactor: 2.5 }),  // not hard
    ];
    (mockVocabStore.entries as any).set(entries);

    component.filterStatus.set('hard');

    const result = component.filteredEntries();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('filteredEntries filters by search term across all entries', () => {
    const entries = [
      makeEntry({ id: 'e1', word: 'serendipity', translation: 'happy accident' }),
      makeEntry({ id: 'e2', word: 'ephemeral', translation: 'short-lived' }),
    ];
    (mockVocabStore.entries as any).set(entries);

    component.searchTerm.set('ephemeral');

    const result = component.filteredEntries();
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe('ephemeral');
  });

  // ── 3. Edit form pre-population ─────────────────────────────────────────────

  /**
   * Validates: Requirement 3.7
   * When startEdit(entry) is called, editingEntry should be set to that entry
   * and all edit form signals should be pre-populated with the entry's data.
   */
  it('sets editingEntry to the selected entry when startEdit is called', () => {
    const entry = makeEntry({ id: 'e1', word: 'serendipity', translation: 'a happy accident' });

    component.startEdit(entry);

    expect(component.editingEntry()).toEqual(entry);
  });

  it('pre-populates editWord and editTranslation when startEdit is called', () => {
    const entry = makeEntry({ id: 'e1', word: 'serendipity', translation: 'a happy accident' });

    component.startEdit(entry);

    expect(component.editWord()).toBe('serendipity');
    expect(component.editTranslation()).toBe('a happy accident');
  });

  it('pre-populates editNotes and editMnemonic when startEdit is called', () => {
    const entry = makeEntry({
      id: 'e1',
      notes: 'some notes',
      mnemonic: 'memory trick',
    });

    component.startEdit(entry);

    expect(component.editNotes()).toBe('some notes');
    expect(component.editMnemonic()).toBe('memory trick');
  });

  it('sets editNotes and editMnemonic to empty string when entry has no notes or mnemonic', () => {
    const entry = makeEntry({ id: 'e1', notes: undefined, mnemonic: undefined });

    component.startEdit(entry);

    expect(component.editNotes()).toBe('');
    expect(component.editMnemonic()).toBe('');
  });

  it('clears editingEntry when cancelEdit is called', () => {
    const entry = makeEntry();
    component.startEdit(entry);

    component.cancelEdit();

    expect(component.editingEntry()).toBeNull();
  });

  // ── 4. Delete confirmation ──────────────────────────────────────────────────

  /**
   * Validates: Requirement 3.7
   * When confirmDelete(id) is called, deleteConfirmId should be set.
   * When executeDelete() is called, VocabularyStoreService.deleteEntry
   * should be called with the correct id.
   */
  it('sets deleteConfirmId when confirmDelete is called', () => {
    component.confirmDelete('entry-42');

    expect(component.deleteConfirmId()).toBe('entry-42');
  });

  it('calls vocabStore.deleteEntry with the correct id when executeDelete is called', async () => {
    component.confirmDelete('entry-42');

    await component.executeDelete();

    expect(mockVocabStore.deleteEntry).toHaveBeenCalledOnce();
    expect(mockVocabStore.deleteEntry).toHaveBeenCalledWith('entry-42');
  });

  it('clears deleteConfirmId after executeDelete', async () => {
    component.confirmDelete('entry-42');

    await component.executeDelete();

    expect(component.deleteConfirmId()).toBeNull();
  });

  it('clears deleteConfirmId when cancelDelete is called', () => {
    component.confirmDelete('entry-42');

    component.cancelDelete();

    expect(component.deleteConfirmId()).toBeNull();
    expect(mockVocabStore.deleteEntry).not.toHaveBeenCalled();
  });
});
