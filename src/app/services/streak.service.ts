import { Injectable } from '@angular/core';
import { VocabularyEntry, ReviewSession, ProgressStats } from '../models/vocabulary-entry.model';

@Injectable({ providedIn: 'root' })
export class StreakService {
  calculateStreak(sessions: ReviewSession[]): number {
    if (sessions.length === 0) return 0;

    // Get unique dates and sort descending
    const uniqueDates = [...new Set(sessions.map((s) => s.date))].sort(
      (a, b) => b.localeCompare(a)
    );

    const today = new Date();
    const todayStr = this.toDateString(today);
    const yesterdayStr = this.toDateString(new Date(today.getTime() - 86_400_000));

    // Most recent date must be today or yesterday
    if (uniqueDates[0] !== todayStr && uniqueDates[0] !== yesterdayStr) {
      return 0;
    }

    // Count consecutive days going back from the most recent date
    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const expected = this.subtractDays(uniqueDates[0], i);
      if (uniqueDates[i] === expected) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  getProgressStats(entries: VocabularyEntry[], sessions: ReviewSession[]): ProgressStats {
    const today = this.toDateString(new Date());

    return {
      totalWords: entries.length,
      dueToday: entries.filter((e) => e.nextReviewDate <= today).length,
      mastered: entries.filter((e) => e.interval >= 21).length,
      streak: this.calculateStreak(sessions),
    };
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private subtractDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }
}
