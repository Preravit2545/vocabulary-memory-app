// Feature: vocabulary-memory-app, Property 11: Streak Calculation Correctness
// Feature: vocabulary-memory-app, Property 12: Progress Stats Accuracy

import { fc, it } from '@fast-check/vitest';
import { StreakService } from '../services/streak.service';
import { ReviewSession, VocabularyEntry } from '../models/vocabulary-entry.model';

/**
 * Validates: Requirements 5.1, 5.3
 *
 * Property 11: Streak Calculation Correctness
 * For any sequence of ReviewSession records, the streak calculation SHALL return the count
 * of consecutive days ending on or before today where at least one session was completed,
 * and SHALL return 0 if the most recent session is not from today or yesterday.
 */

// Helper: get a YYYY-MM-DD string for N days ago (UTC)
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Build a ReviewSession for a given date string
function makeSession(date: string, id = date): ReviewSession {
  return {
    id,
    date,
    reviewedCount: 1,
    completedAt: `${date}T12:00:00.000Z`,
  };
}

describe('StreakService — Property 11: Streak Calculation Correctness', () => {
  // Case 1: Empty sessions → streak = 0
  it('returns 0 for empty sessions array', () => {
    const service = new StreakService();
    expect(service.calculateStreak([])).toBe(0);
  });

  // Case 2: Sessions only from days older than yesterday → streak = 0
  it.prop(
    [
      fc
        .integer({ min: 2, max: 30 })
        .chain((oldestOffset) =>
          fc
            .uniqueArray(fc.integer({ min: 2, max: oldestOffset }), {
              minLength: 1,
              maxLength: 10,
            })
            .map((offsets) => offsets.map((o) => makeSession(daysAgo(o))))
        ),
    ],
    { numRuns: 100 }
  )(
    'returns 0 when all sessions are older than yesterday',
    (sessions) => {
      const service = new StreakService();
      expect(service.calculateStreak(sessions)).toBe(0);
    }
  );

  // Case 3: Sessions from N consecutive days ending today → streak = N
  it.prop(
    [fc.integer({ min: 1, max: 20 })],
    { numRuns: 100 }
  )(
    'returns N for N consecutive days ending today',
    (n) => {
      const service = new StreakService();
      // Build sessions for days 0, 1, 2, ..., n-1 (today back to n-1 days ago)
      const sessions = Array.from({ length: n }, (_, i) => makeSession(daysAgo(i)));
      expect(service.calculateStreak(sessions)).toBe(n);
    }
  );

  // Case 4: Sessions from N consecutive days ending yesterday → streak = N
  it.prop(
    [fc.integer({ min: 1, max: 20 })],
    { numRuns: 100 }
  )(
    'returns N for N consecutive days ending yesterday',
    (n) => {
      const service = new StreakService();
      // Build sessions for days 1, 2, ..., n (yesterday back to n days ago)
      const sessions = Array.from({ length: n }, (_, i) => makeSession(daysAgo(i + 1)));
      expect(service.calculateStreak(sessions)).toBe(n);
    }
  );

  // Property: streak never exceeds the number of unique dates in sessions
  it.prop(
    [
      fc.array(
        fc.integer({ min: 0, max: 10 }).map((offset) => makeSession(daysAgo(offset))),
        { minLength: 0, maxLength: 20 }
      ),
    ],
    { numRuns: 100 }
  )(
    'streak never exceeds the number of unique session dates',
    (sessions) => {
      const service = new StreakService();
      const uniqueDates = new Set(sessions.map((s) => s.date)).size;
      const streak = service.calculateStreak(sessions);
      expect(streak).toBeLessThanOrEqual(uniqueDates);
    }
  );

  // Property: streak is 0 when most recent session is not today or yesterday
  it.prop(
    [
      fc
        .integer({ min: 2, max: 30 })
        .chain((mostRecentOffset) =>
          fc
            .array(fc.integer({ min: mostRecentOffset, max: mostRecentOffset + 10 }), {
              minLength: 1,
              maxLength: 10,
            })
            .map((offsets) => offsets.map((o) => makeSession(daysAgo(o))))
        ),
    ],
    { numRuns: 100 }
  )(
    'returns 0 when most recent session is not today or yesterday',
    (sessions) => {
      const service = new StreakService();
      expect(service.calculateStreak(sessions)).toBe(0);
    }
  );
});

// Feature: vocabulary-memory-app, Property 12: Progress Stats Accuracy

/**
 * Validates: Requirements 5.4, 5.5, 5.6
 *
 * Property 12: Progress Stats Accuracy
 * For any collection of VocabularyEntry items, getProgressStats() SHALL return:
 *   - totalWords equal to the collection size
 *   - dueToday equal to the count of entries with nextReviewDate <= today
 *   - mastered equal to the count of entries with interval >= 21
 */

// Helper: get today's date string (YYYY-MM-DD, UTC)
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Arbitrary VocabularyEntry with controllable nextReviewDate and interval
const arbVocabularyEntry = fc.record({
  id: fc.uuid(),
  word: fc.string({ minLength: 1, maxLength: 20 }),
  translation: fc.string({ minLength: 1, maxLength: 20 }),
  exampleSentences: fc.array(fc.string()),
  synonyms: fc.array(fc.string()),
  antonyms: fc.array(fc.string()),
  // nextReviewDate: offset in days from today (-30 to +30)
  nextReviewDate: fc.integer({ min: -30, max: 30 }).map((offset) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }),
  interval: fc.integer({ min: 1, max: 60 }),
  easeFactor: fc.float({ min: Math.fround(1.3), max: Math.fround(4.0) }),
  reviewCount: fc.nat(),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString()),
}) as fc.Arbitrary<VocabularyEntry>;

describe('StreakService — Property 12: Progress Stats Accuracy', () => {
  it.prop(
    [fc.array(arbVocabularyEntry, { minLength: 0, maxLength: 50 })],
    { numRuns: 100 }
  )(
    'totalWords equals the number of entries',
    (entries) => {
      const service = new StreakService();
      const stats = service.getProgressStats(entries, []);
      expect(stats.totalWords).toBe(entries.length);
    }
  );

  it.prop(
    [fc.array(arbVocabularyEntry, { minLength: 0, maxLength: 50 })],
    { numRuns: 100 }
  )(
    'dueToday equals count of entries with nextReviewDate <= today',
    (entries) => {
      const service = new StreakService();
      const today = todayStr();
      const expectedDueToday = entries.filter((e) => e.nextReviewDate <= today).length;
      const stats = service.getProgressStats(entries, []);
      expect(stats.dueToday).toBe(expectedDueToday);
    }
  );

  it.prop(
    [fc.array(arbVocabularyEntry, { minLength: 0, maxLength: 50 })],
    { numRuns: 100 }
  )(
    'mastered equals count of entries with interval >= 21',
    (entries) => {
      const service = new StreakService();
      const expectedMastered = entries.filter((e) => e.interval >= 21).length;
      const stats = service.getProgressStats(entries, []);
      expect(stats.mastered).toBe(expectedMastered);
    }
  );
});
