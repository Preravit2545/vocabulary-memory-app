import { Component, computed, inject, signal, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { VocabularyEntry, FilterStatus } from '../../models/vocabulary-entry.model';
import { filterBySearch, filterByStatus } from '../../utils/filters';

@Component({
  encapsulation: ViewEncapsulation.None,
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-2xl mx-auto p-4 space-y-4">
      <h2 class="text-xl font-bold">Vocabulary Dashboard</h2>

      <!-- Search input -->
      <div>
        <label class="sr-only" for="search-input">Search vocabulary</label>
        <input
          id="search-input"
          type="search"
          class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Search word or translation..."
          [ngModel]="rawSearchInput()"
          (ngModelChange)="onSearchInput($event)"
        />
      </div>

      <!-- Filter tabs -->
      <div class="flex gap-2 flex-wrap" role="tablist" aria-label="Filter by status">
        @for (tab of filterTabs; track tab.value) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="filterStatus() === tab.value"
            class="px-4 min-h-[44px] rounded font-medium transition-colors"
            [class]="filterStatus() === tab.value
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
            (click)="filterStatus.set(tab.value)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      <!-- Entry count -->
      <p class="text-sm text-gray-500">
        {{ filteredEntries().length }} {{ filteredEntries().length === 1 ? 'entry' : 'entries' }}
      </p>

      <!-- Empty state -->
      @if (filteredEntries().length === 0) {
        <div class="text-center py-12 text-gray-400">
          <p class="text-lg">No entries found</p>
          @if (searchTerm() || filterStatus() !== 'all') {
            <p class="text-sm mt-1">Try adjusting your search or filter.</p>
          } @else {
            <p class="text-sm mt-1">Add your first word to get started.</p>
          }
        </div>
      }

      <!-- Entry list -->
      <ul class="space-y-3" aria-label="Vocabulary entries">
        @for (entry of filteredEntries(); track entry.id) {
          <li class="border border-gray-200 rounded-lg overflow-hidden shadow-sm">

            <!-- Inline edit form -->
            @if (editingEntry()?.id === entry.id) {
              <div class="p-4 space-y-3 bg-blue-50 shadow-inner">
                <h3 class="font-semibold text-blue-800">Edit Entry</h3>

                <div>
                  <label class="block text-sm font-medium mb-1" [for]="'edit-word-' + entry.id">Word</label>
                  <input
                    [id]="'edit-word-' + entry.id"
                    type="text"
                    class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    [ngModel]="editWord()"
                    (ngModelChange)="editWord.set($event)"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1" [for]="'edit-translation-' + entry.id">Translation</label>
                  <input
                    [id]="'edit-translation-' + entry.id"
                    type="text"
                    class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    [ngModel]="editTranslation()"
                    (ngModelChange)="editTranslation.set($event)"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1" [for]="'edit-pos-' + entry.id">Part of Speech</label>
                  <input
                    [id]="'edit-pos-' + entry.id"
                    type="text"
                    class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="noun, verb, adjective..."
                    [ngModel]="editPos()"
                    (ngModelChange)="editPos.set($event)"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1" [for]="'edit-notes-' + entry.id">Notes</label>
                  <textarea
                    [id]="'edit-notes-' + entry.id"
                    class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    rows="2"
                    [ngModel]="editNotes()"
                    (ngModelChange)="editNotes.set($event)"
                  ></textarea>
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1" [for]="'edit-mnemonic-' + entry.id">Mnemonic</label>
                  <textarea
                    [id]="'edit-mnemonic-' + entry.id"
                    class="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    rows="2"
                    [ngModel]="editMnemonic()"
                    (ngModelChange)="editMnemonic.set($event)"
                  ></textarea>
                </div>

                <div class="flex gap-2">
                  <button
                    type="button"
                    class="flex-1 bg-primary text-white rounded px-4 min-h-[44px] font-medium hover:bg-primary-hover transition-colors"
                    (click)="saveEdit()"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    class="px-4 min-h-[44px] border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors"
                    (click)="cancelEdit()"
                  >
                    Cancel
                  </button>
                </div>
              </div>

            <!-- Delete confirmation -->
            } @else if (deleteConfirmId() === entry.id) {
              <div class="p-4 bg-red-50 space-y-3">
                <p class="font-medium text-red-800">Delete "<span class="font-bold">{{ entry.word }}</span>"?</p>
                <p class="text-sm text-red-600">This action cannot be undone.</p>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="flex-1 bg-red-600 text-white rounded px-4 min-h-[44px] font-medium hover:bg-red-700 transition-colors"
                    (click)="executeDelete()"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    class="px-4 min-h-[44px] border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors"
                    (click)="cancelDelete()"
                  >
                    Cancel
                  </button>
                </div>
              </div>

            <!-- Normal entry view -->
            } @else {
              <div class="p-4">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-gray-900 truncate">{{ entry.word }}</p>
                    @if (entry.pos) {
                      <p class="text-xs text-purple-500 font-medium">{{ entry.pos }}</p>
                    }
                    <p class="text-gray-600 text-sm truncate">{{ entry.translation }}</p>
                    <div class="flex gap-3 mt-1 text-xs text-gray-400">
                      <span>Interval: {{ entry.interval }}d</span>
                      <span>EF: {{ entry.easeFactor | number:'1.1-2' }}</span>
                      <span>Next: {{ entry.nextReviewDate }}</span>
                    </div>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    <button
                      type="button"
                      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors px-3"
                      [attr.aria-label]="'Edit ' + entry.word"
                      (click)="startEdit(entry)"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors px-3"
                      [attr.aria-label]="'Delete ' + entry.word"
                      (click)="confirmDelete(entry.id)"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            }

          </li>
        }
      </ul>
    </div>
  `,
})
export class DashboardComponent implements OnDestroy {
  protected vocabStore = inject(VocabularyStoreService);

  // Raw input signal (before debounce)
  rawSearchInput = signal('');

  // Debounced search term
  searchTerm = signal('');
  filterStatus = signal<FilterStatus>('all');

  editingEntry = signal<VocabularyEntry | null>(null);
  deleteConfirmId = signal<string | null>(null);

  // Edit form signals
  editWord = signal('');
  editTranslation = signal('');
  editPos = signal('');
  editNotes = signal('');
  editMnemonic = signal('');

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filterTabs: { label: string; value: FilterStatus }[] = [
    { label: 'All', value: 'all' },
    { label: 'Due Today', value: 'due-today' },
    { label: 'Hard Words', value: 'hard' },
    { label: 'Mastered', value: 'mastered' },
  ];

  filteredEntries = computed(() => {
    const entries = this.vocabStore.entries() ?? [];
    const searched = filterBySearch(entries, this.searchTerm());
    return filterByStatus(searched, this.filterStatus());
  });

  onSearchInput(term: string): void {
    this.rawSearchInput.set(term);
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.searchTerm.set(term);
      this.debounceTimer = null;
    }, 300);
  }

  startEdit(entry: VocabularyEntry): void {
    this.editingEntry.set(entry);
    this.editWord.set(entry.word);
    this.editTranslation.set(entry.translation);
    this.editPos.set(entry.pos ?? '');
    this.editNotes.set(entry.notes ?? '');
    this.editMnemonic.set(entry.mnemonic ?? '');
  }

  saveEdit(): void {
    const entry = this.editingEntry();
    if (!entry) return;
    this.vocabStore.updateEntry(entry.id, {
      word: this.editWord().trim().toLowerCase(),
      translation: this.editTranslation().trim(),
      pos: this.editPos().trim() || undefined,
      notes: this.editNotes().trim() || undefined,
      mnemonic: this.editMnemonic().trim() || undefined,
    });
    this.editingEntry.set(null);
  }

  cancelEdit(): void {
    this.editingEntry.set(null);
  }

  confirmDelete(id: string): void {
    this.deleteConfirmId.set(id);
  }

  executeDelete(): void {
    const id = this.deleteConfirmId();
    if (!id) return;
    this.vocabStore.deleteEntry(id);
    this.deleteConfirmId.set(null);
  }

  cancelDelete(): void {
    this.deleteConfirmId.set(null);
  }

  ngOnDestroy(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
  }
}
