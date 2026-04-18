import { Component, inject, signal, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AiService } from '../../services/ai.service';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { AIEnrichmentResult } from '../../models/vocabulary-entry.model';

@Component({
  encapsulation: ViewEncapsulation.None,
  selector: 'app-add-word',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-lg mx-auto p-4 space-y-4">
      <h2 class="text-xl font-bold">Add New Word</h2>

      <!-- Error message -->
      @if (error()) {
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert">
          {{ error() }}
        </div>
      }

      <!-- Duplicate warning -->
      @if (duplicateWarning()) {
        <div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded" role="alert">
          This word already exists in your collection.
        </div>
      }

      <!-- Word input -->
      <div>
        <label class="block text-sm font-medium mb-1" for="word-input">Word <span class="text-red-500">*</span></label>
        <input
          id="word-input"
          type="text"
          class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Enter vocabulary word"
          [ngModel]="word()"
          (ngModelChange)="word.set($event); duplicateWarning.set(false)"
        />
      </div>

      <!-- Original sentence input -->
      <div>
        <label class="block text-sm font-medium mb-1" for="sentence-input">Original Sentence</label>
        <textarea
          id="sentence-input"
          class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Sentence where you found this word"
          rows="2"
          [ngModel]="originalSentence()"
          (ngModelChange)="originalSentence.set($event)"
        ></textarea>
      </div>

      <!-- Notes input -->
      <div>
        <label class="block text-sm font-medium mb-1" for="notes-input">Notes</label>
        <textarea
          id="notes-input"
          class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Optional notes"
          rows="2"
          [ngModel]="notes()"
          (ngModelChange)="notes.set($event)"
        ></textarea>
      </div>

      <!-- Enrich with AI button -->
      <button
        type="button"
        class="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded px-4 min-h-[44px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-700 transition-colors"
        [disabled]="isEnriching() || !word().trim()"
        (click)="enrichWithAI()"
      >
        @if (isEnriching()) {
          <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Enriching...</span>
        } @else {
          <span>✨ Enrich with AI</span>
        }
      </button>

      <!-- Enrichment result section -->
      @if (enrichment() !== null || translation() || synonyms().length || antonyms().length || mnemonic() || exampleSentences().length) {
        <div class="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <h3 class="font-semibold text-gray-700">AI Enrichment</h3>

          <!-- Translation -->
          <div>
            <label class="block text-sm font-medium mb-1" for="translation-input">Translation</label>
            <input
              id="translation-input"
              type="text"
              class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Translation"
              [ngModel]="translation()"
              (ngModelChange)="translation.set($event)"
            />
          </div>

          <!-- Synonyms -->
          <div>
            <label class="block text-sm font-medium mb-1" for="synonyms-input">Synonyms (comma-separated)</label>
            <input
              id="synonyms-input"
              type="text"
              class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="synonym1, synonym2"
              [ngModel]="synonyms().join(', ')"
              (ngModelChange)="synonyms.set(splitTags($event))"
            />
          </div>

          <!-- Antonyms -->
          <div>
            <label class="block text-sm font-medium mb-1" for="antonyms-input">Antonyms (comma-separated)</label>
            <input
              id="antonyms-input"
              type="text"
              class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="antonym1, antonym2"
              [ngModel]="antonyms().join(', ')"
              (ngModelChange)="antonyms.set(splitTags($event))"
            />
          </div>

          <!-- Mnemonic -->
          <div>
            <label class="block text-sm font-medium mb-1" for="mnemonic-input">Mnemonic</label>
            <textarea
              id="mnemonic-input"
              class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Memory aid or story"
              rows="2"
              [ngModel]="mnemonic()"
              (ngModelChange)="mnemonic.set($event)"
            ></textarea>
          </div>

          <!-- Example sentences -->
          <div>
            <label class="block text-sm font-medium mb-1" for="examples-input">Example Sentences (one per line)</label>
            <textarea
              id="examples-input"
              class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Example sentence 1&#10;Example sentence 2"
              rows="3"
              [ngModel]="exampleSentences().join('\n')"
              (ngModelChange)="exampleSentences.set(splitLines($event))"
            ></textarea>
          </div>
        </div>
      }

      <!-- Action buttons -->
      <div class="flex gap-3">
        <button
          type="button"
          class="flex-1 bg-blue-600 text-white rounded px-4 min-h-[44px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          [disabled]="!word().trim() || isSaving()"
          (click)="saveEntry()"
        >
          @if (isSaving()) {
            Saving...
          } @else {
            Save
          }
        </button>
        <button
          type="button"
          class="px-4 min-h-[44px] border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          (click)="resetForm()"
        >
          Reset
        </button>
      </div>
    </div>
  `,
})
export class AddWordComponent {
  private aiService = inject(AiService);
  private vocabStore = inject(VocabularyStoreService);

  // Form signals
  word = signal('');
  originalSentence = signal('');
  notes = signal('');

  // Enrichment state
  enrichment = signal<AIEnrichmentResult | null>(null);
  isEnriching = signal(false);
  error = signal<string | null>(null);
  duplicateWarning = signal(false);
  isSaving = signal(false);

  // Editable enrichment fields
  translation = signal('');
  synonyms = signal<string[]>([]);
  antonyms = signal<string[]>([]);
  mnemonic = signal('');
  exampleSentences = signal<string[]>([]);

  async enrichWithAI(): Promise<void> {
    this.isEnriching.set(true);
    this.error.set(null);

    try {
      const result = await this.aiService.enrichVocabulary({
        word: this.word().trim(),
        originalSentence: this.originalSentence().trim(),
      });

      this.enrichment.set(result);
      this.translation.set(result.translation);
      this.synonyms.set(result.synonyms);
      this.antonyms.set(result.antonyms);
      this.mnemonic.set(result.mnemonic);
      this.exampleSentences.set(result.exampleSentences);

      if (result.partialError) {
        this.error.set(result.partialError);
      }
    } catch (err: any) {
      this.error.set(err?.message ?? 'AI enrichment failed');
    } finally {
      this.isEnriching.set(false);
    }
  }

  async saveEntry(): Promise<void> {
    const wordValue = this.word().trim().toLowerCase();
    if (!wordValue) return;

    this.isSaving.set(true);
    this.error.set(null);
    this.duplicateWarning.set(false);

    try {
      const existing = await this.vocabStore.findByWord(wordValue);
      if (existing) {
        this.duplicateWarning.set(true);
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      await this.vocabStore.addEntry({
        word: wordValue,
        translation: this.translation(),
        originalSentence: this.originalSentence().trim() || undefined,
        notes: this.notes().trim() || undefined,
        exampleSentences: this.exampleSentences(),
        synonyms: this.synonyms(),
        antonyms: this.antonyms(),
        mnemonic: this.mnemonic().trim() || undefined,
        interval: 1,
        easeFactor: 2.5,
        nextReviewDate: today,
        reviewCount: 0,
      });

      this.resetForm();
    } catch (err: any) {
      if (err?.message === 'DUPLICATE_WORD') {
        this.duplicateWarning.set(true);
      } else {
        this.error.set(err?.message ?? 'Failed to save entry');
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  resetForm(): void {
    this.word.set('');
    this.originalSentence.set('');
    this.notes.set('');
    this.enrichment.set(null);
    this.isEnriching.set(false);
    this.error.set(null);
    this.duplicateWarning.set(false);
    this.isSaving.set(false);
    this.translation.set('');
    this.synonyms.set([]);
    this.antonyms.set([]);
    this.mnemonic.set('');
    this.exampleSentences.set([]);
  }

  splitTags(value: string): string[] {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  splitLines(value: string): string[] {
    return value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
}
