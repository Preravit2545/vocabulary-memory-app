import { Component, inject, signal, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
import { from } from 'rxjs';
import { AiService } from '../../services/ai.service';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { AIEnrichmentResult, VocabularyEntry } from '../../models/vocabulary-entry.model';

@Component({
  encapsulation: ViewEncapsulation.None,
  selector: 'app-add-word',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
      @if (duplicateEntry()) {
        <div class="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded flex items-center justify-between gap-3" role="alert">
          <span>
            "<strong>{{ duplicateEntry()!.word }}</strong>" already exists in your collection.
          </span>
          <a
            routerLink="/dashboard"
            class="shrink-0 underline font-medium text-yellow-900 hover:text-yellow-700"
          >View in Dashboard</a>
        </div>
      }

      <!-- Similar words notice (Req 9) -->
      @if (similarEntries().length > 0) {
        <div class="bg-blue-50 border border-blue-300 text-blue-800 px-4 py-3 rounded space-y-1" role="status">
          <p class="font-medium">Similar words already in your collection:</p>
          <ul class="list-disc list-inside text-sm">
            @for (entry of similarEntries(); track entry.id) {
              <li>{{ entry.word }}</li>
            }
          </ul>
          <p class="text-sm">
            You can still save this word, or
            <a routerLink="/dashboard" class="underline font-medium hover:text-blue-600">browse your collection</a>
            to find a related entry.
          </p>
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
          (input)="onWordInput($event)"
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

          <!-- Part of Speech -->
          @if (pos()) {
            <div>
              <label class="block text-sm font-medium mb-1" for="pos-input">Part of Speech</label>
              <input
                id="pos-input"
                type="text"
                class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="noun, verb, adjective..."
                [ngModel]="pos()"
                (ngModelChange)="pos.set($event)"
              />
            </div>
          }

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
              placeholder="เขียน mnemonic ของคุณเองที่นี่"
              rows="2"
              [ngModel]="mnemonic()"
              (ngModelChange)="mnemonic.set($event)"
            ></textarea>
            @if (enrichment() !== null) {
              <button
                type="button"
                class="mt-2 flex items-center justify-center gap-2 w-full border border-purple-400 text-purple-700 rounded px-4 min-h-[44px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-50 transition-colors"
                [disabled]="isRegeneratingMnemonic()"
                (click)="regenerateMnemonic()"
              >
                @if (isRegeneratingMnemonic()) {
                  <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Regenerating...</span>
                } @else {
                  <span>🔄 Regenerate Mnemonic</span>
                }
              </button>
            }
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
          class="flex-1 bg-primary text-white rounded px-4 min-h-[44px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-hover transition-colors"
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
export class AddWordComponent implements OnInit, OnDestroy {
  private aiService = inject(AiService);
  private vocabStore = inject(VocabularyStoreService);

  // Form signals
  word = signal('');
  originalSentence = signal('');
  notes = signal('');

  // Enrichment state
  enrichment = signal<AIEnrichmentResult | null>(null);
  isEnriching = signal(false);
  isRegeneratingMnemonic = signal(false);
  error = signal<string | null>(null);
  isSaving = signal(false);

  // Req 8: Proactive Duplicate Detection
  duplicateEntry = signal<VocabularyEntry | null>(null);

  // Req 9: Synonym Group Awareness
  similarEntries = signal<VocabularyEntry[]>([]);
  private wordInput$ = new Subject<string>();
  private duplicateSub?: Subscription;

  // Editable enrichment fields
  pos = signal('');
  translation = signal('');
  synonyms = signal<string[]>([]);
  antonyms = signal<string[]>([]);
  mnemonic = signal('');
  exampleSentences = signal<string[]>([]);

  ngOnInit(): void {
    this.duplicateSub = this.wordInput$.pipe(
      debounceTime(200),
      switchMap((term) => {
        const trimmed = term.trim();
        if (!trimmed) {
          return from(Promise.resolve(null));
        }
        return from(this.vocabStore.findByWord(trimmed));
      })
    ).subscribe((result) => {
      this.duplicateEntry.set(result);
    });
  }

  ngOnDestroy(): void {
    this.duplicateSub?.unsubscribe();
  }

  onWordInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.word.set(value);
    this.wordInput$.next(value);
    if (!value.trim()) {
      this.duplicateEntry.set(null);
    }
  }

  async regenerateMnemonic(): Promise<void> {
    this.isRegeneratingMnemonic.set(true);
    try {
      const result = await this.aiService.regenerateMnemonic(
        this.word().trim(),
        this.translation(),
      );
      if (!result.mnemonic) {
        this.mnemonic.set('เขียน mnemonic ของคุณเองที่นี่');
      } else {
        this.mnemonic.set(result.mnemonic);
      }
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to regenerate mnemonic');
    } finally {
      this.isRegeneratingMnemonic.set(false);
    }
  }

  async enrichWithAI(): Promise<void> {
    this.isEnriching.set(true);
    this.error.set(null);

    try {
      const result = await this.aiService.enrichVocabulary({
        word: this.word().trim(),
        originalSentence: this.originalSentence().trim(),
      });

      this.enrichment.set(result);
      this.pos.set(result.pos);
      this.translation.set(result.translation);
      this.synonyms.set(result.synonyms);
      this.antonyms.set(result.antonyms);
      this.mnemonic.set(result.mnemonic);
      this.exampleSentences.set(result.exampleSentences);

      if (result.partialError) {
        this.error.set(result.partialError);
      }

      // Req 9: check for synonym overlap after enrichment
      const similar = await this.vocabStore.findBySynonymOverlap(result.synonyms);
      this.similarEntries.set(similar);
    } catch (err: any) {
      this.error.set(err?.message ?? 'AI enrichment failed');
    } finally {
      this.isEnriching.set(false);
    }
  }

  async saveEntry(): Promise<void> {
    const wordValue = this.word().trim().toLowerCase();
    if (!wordValue) return;

    // Req 8.3: prevent save if duplicate still exists
    if (this.duplicateEntry()) return;

    this.isSaving.set(true);
    this.error.set(null);

    try {
      const existing = await this.vocabStore.findByWord(wordValue);
      if (existing) {
        this.duplicateEntry.set(existing);
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      await this.vocabStore.addEntry({
        word: wordValue,
        translation: this.translation(),
        pos: this.pos() || undefined,
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
        const dup = await this.vocabStore.findByWord(wordValue);
        this.duplicateEntry.set(dup);
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
    this.duplicateEntry.set(null);
    this.similarEntries.set([]);
    this.isSaving.set(false);
    this.pos.set('');
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
