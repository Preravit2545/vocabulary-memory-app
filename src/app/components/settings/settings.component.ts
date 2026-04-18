import { Component, inject, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { ImportExportService } from '../../services/import-export.service';
import { ImportResult } from '../../models/vocabulary-entry.model';

@Component({
  encapsulation: ViewEncapsulation.None,
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-2xl mx-auto p-4 space-y-8">
      <h2 class="text-xl font-bold">Settings</h2>

      <!-- API Key Section -->
      <section class="space-y-3">
        <h3 class="text-lg font-semibold text-gray-800">API Key</h3>
        <p class="text-sm text-gray-500">
          Enter your DashScope API key to enable AI enrichment features.
        </p>
        <div class="flex gap-2">
          <label class="sr-only" for="api-key-input">DashScope API Key</label>
          <input
            id="api-key-input"
            type="password"
            class="flex-1 border border-gray-300 rounded px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="sk-..."
            [ngModel]="apiKey()"
            (ngModelChange)="apiKey.set($event)"
            autocomplete="off"
          />
          <button
            type="button"
            class="px-5 min-h-[44px] bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors"
            (click)="saveApiKey()"
          >
            Save
          </button>
        </div>
      </section>

      <!-- Export Section -->
      <section class="space-y-3">
        <h3 class="text-lg font-semibold text-gray-800">Export</h3>
        <p class="text-sm text-gray-500">
          Download all your vocabulary entries as a JSON file.
        </p>
        <button
          type="button"
          class="w-full sm:w-auto px-6 min-h-[44px] bg-green-600 text-white rounded font-medium hover:bg-green-700 transition-colors"
          (click)="exportData()"
        >
          Export Vocabulary
        </button>
      </section>

      <!-- Import Section -->
      <section class="space-y-3">
        <h3 class="text-lg font-semibold text-gray-800">Import</h3>
        <p class="text-sm text-gray-500">
          Import vocabulary entries from a previously exported JSON file.
        </p>
        <div>
          <label class="sr-only" for="import-file-input">Import JSON file</label>
          <input
            id="import-file-input"
            type="file"
            accept=".json"
            class="block w-full text-sm text-gray-600
              file:mr-4 file:py-3 file:px-5
              file:rounded file:border-0
              file:min-h-[44px]
              file:text-sm file:font-medium
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              cursor-pointer"
            (change)="onImportFile($event)"
          />
        </div>

        <!-- Import result -->
        @if (importResult(); as result) {
          <div class="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
            <p class="font-medium">Import complete</p>
            <p>Imported {{ result.imported }}, skipped {{ result.skipped }}</p>
            @if (result.errors.length > 0) {
              <ul class="mt-2 list-disc list-inside text-yellow-700 space-y-1">
                @for (err of result.errors; track err) {
                  <li>{{ err }}</li>
                }
              </ul>
            }
          </div>
        }

        <!-- Import error -->
        @if (importError(); as err) {
          <div class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            <p class="font-medium">Import failed</p>
            <p>{{ err }}</p>
          </div>
        }
      </section>
    </div>

    <!-- Toast notification -->
    @if (toast(); as message) {
      <div
        role="status"
        aria-live="polite"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
          bg-gray-900 text-white text-sm font-medium
          px-5 py-3 rounded-full shadow-lg
          min-h-[44px] flex items-center"
      >
        {{ message }}
      </div>
    }
  `,
})
export class SettingsComponent {
  private vocabStore = inject(VocabularyStoreService);
  private importExport = inject(ImportExportService);

  apiKey = signal(localStorage.getItem('dashscope_api_key') ?? '');
  importResult = signal<ImportResult | null>(null);
  importError = signal<string | null>(null);
  toast = signal<string | null>(null);

  saveApiKey(): void {
    localStorage.setItem('dashscope_api_key', this.apiKey());
    this.showToast('API key saved');
  }

  async exportData(): Promise<void> {
    const entries = await this.vocabStore.getAllEntries();
    const json = this.importExport.exportToJSON(entries);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabulary-export-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async onImportFile(event: Event): Promise<void> {
    this.importResult.set(null);
    this.importError.set(null);

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const json = await file.text();
      const existing = await this.vocabStore.getAllEntries();
      const result = this.importExport.importFromJSON(json, existing);

      if (result.errors.length > 0 && result.imported === 0) {
        this.importError.set(result.errors[0]);
        return;
      }

      // Add each valid imported entry (skip duplicates silently)
      const parsed = JSON.parse(json);
      const existingWords = new Set(existing.map((e) => e.word.toLowerCase()));

      for (const entry of parsed.entries ?? []) {
        if (existingWords.has((entry.word as string)?.toLowerCase())) continue;
        try {
          await this.vocabStore.addEntry(entry);
        } catch {
          // skip duplicates silently
        }
      }

      this.importResult.set(result);
      this.showToast(`Imported ${result.imported}, skipped ${result.skipped}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to read file';
      this.importError.set(message);
    }

    // Reset file input so the same file can be re-imported
    input.value = '';
  }

  showToast(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(null), 3000);
  }
}
