import { Component, inject, signal, OnInit, ViewEncapsulation, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressStats } from '../../models/vocabulary-entry.model';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { StreakService } from '../../services/streak.service';
import { SyncService } from '../../services/sync.service';
import { AuthService } from '../../services/auth.service';
import { ApiClient } from '../../services/api-client';
import { db } from '../../db/vocab-memory-db';

@Component({
  encapsulation: ViewEncapsulation.None,
  selector: 'app-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-2xl mx-auto p-4 space-y-4">
      <h2 class="text-xl font-bold">Progress</h2>

      <!-- Loading spinner -->
      @if (isLoading()) {
        <div class="flex justify-center items-center py-16" aria-label="Loading stats">
          <div class="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      }

      <!-- Stats cards -->
      @if (!isLoading() && stats()) {
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">

          <!-- Streak card (prominent) -->
          <div class="sm:col-span-2 bg-gradient-to-r from-orange-400 to-red-500 text-white rounded-2xl p-6 flex flex-col items-center shadow-md">
            <span class="text-5xl font-extrabold">🔥 {{ stats()!.streak }}</span>
            <span class="mt-2 text-lg font-semibold tracking-wide">
              {{ stats()!.streak === 1 ? 'day streak' : 'day streak' }}
            </span>
          </div>

          <!-- Total words -->
          <div class="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col items-center shadow-sm">
            <span class="text-4xl font-bold text-primary">{{ stats()!.totalWords }}</span>
            <span class="mt-1 text-sm text-gray-500 font-medium">Total Words</span>
          </div>

          <!-- Due today -->
          <div class="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col items-center shadow-sm">
            <span class="text-4xl font-bold text-rating-hard">{{ stats()!.dueToday }}</span>
            <span class="mt-1 text-sm text-gray-500 font-medium">Due Today</span>
          </div>

          <!-- Mastered -->
          <div class="sm:col-span-2 bg-white border border-gray-200 rounded-2xl p-5 flex flex-col items-center shadow-sm">
            <span class="text-4xl font-bold text-rating-easy">{{ stats()!.mastered }}</span>
            <span class="mt-1 text-sm text-gray-500 font-medium">Mastered (interval ≥ 21 days)</span>
          </div>

        </div>
      }
    </div>
  `,
})
export class ProgressComponent implements OnInit {
  private vocabStore = inject(VocabularyStoreService);
  private streakService = inject(StreakService);
  private syncService = inject(SyncService);
  private authService = inject(AuthService);
  private apiClient = inject(ApiClient);

  stats = signal<ProgressStats | null>(null);
  isLoading = signal(true);

  constructor() {
    // Reload stats whenever sync completes
    effect(() => {
      if (this.syncService.syncStatus() === 'synced') {
        this.loadStats();
      }
    });
  }

  ngOnInit(): void {
    this.loadStats();
  }

  private async loadStats(): Promise<void> {
    try {
      if (this.authService.isAuthenticated()) {
        // Authenticated: fetch from cloud database as source of truth
        const [entries, sessions] = await Promise.all([
          this.apiClient.getVocabulary(),
          this.apiClient.getReviewSessions(),
        ]);
        this.stats.set(this.streakService.getProgressStats(entries, sessions));
      } else {
        // Guest mode: use local IndexedDB
        const [entries, sessions] = await Promise.all([
          this.vocabStore.getAllEntries(),
          db.reviewSessions.toArray(),
        ]);
        this.stats.set(this.streakService.getProgressStats(entries, sessions));
      }
    } catch (err) {
      console.error('Failed to load progress stats:', err);
      // Fallback to local data on error
      const [entries, sessions] = await Promise.all([
        this.vocabStore.getAllEntries(),
        db.reviewSessions.toArray(),
      ]);
      this.stats.set(this.streakService.getProgressStats(entries, sessions));
    } finally {
      this.isLoading.set(false);
    }
  }
}
