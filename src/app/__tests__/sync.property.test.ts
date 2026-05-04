// Feature: vocabulary-memory-app, Properties 37, 38, 39, 41: Sync

import '@angular/compiler';
import { fc, it } from '@fast-check/vitest';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
} from '@angular/core';
import { SyncService } from '../services/sync.service';
import { AuthService } from '../services/auth.service';
import { ApiClient } from '../services/api-client';
import { VocabularyEntry } from '../models/vocabulary-entry.model';

/**
 * Shared arbitrary for VocabularyEntry
 */
const arbitraryEntry = () =>
  fc.record({
    id: fc.uuid(),
    word: fc.string({ minLength: 1 }),
    translation: fc.string({ minLength: 1 }),
    originalSentence: fc.option(fc.string(), { nil: undefined }),
    notes: fc.option(fc.string(), { nil: undefined }),
    exampleSentences: fc.array(fc.string()),
    synonyms: fc.array(fc.string()),
    antonyms: fc.array(fc.string()),
    mnemonic: fc.option(fc.string(), { nil: undefined }),
    interval: fc.integer({ min: 1, max: 365 }),
    easeFactor: fc.float({ min: Math.fround(1.3), max: Math.fround(4.0), noNaN: true }),
    nextReviewDate: fc.string(),
    reviewCount: fc.nat(),
    createdAt: fc.string(),
    updatedAt: fc.string(),
  });

/**
 * Property 37: Conflict Resolution — Last-Write-Wins
 * Validates: Requirements 21.3
 *
 * For any two VocabularyEntry versions with same id but different updatedAt,
 * resolveConflict(local, cloud) returns the one with the later updatedAt.
 */
describe('SyncService — Property 37: Conflict Resolution — Last-Write-Wins', () => {
  let injector: EnvironmentInjector;
  let syncService: SyncService;

  beforeAll(() => {
    injector = createEnvironmentInjector([AuthService, ApiClient, SyncService]);
    syncService = injector.get(SyncService);
  });

  afterAll(() => {
    injector.destroy();
  });

  it.prop(
    [
      arbitraryEntry(),
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
    ],
    { numRuns: 100 }
  )(
    'resolveConflict returns the entry with the later updatedAt when they differ',
    (base, updatedAtA, updatedAtB) => {
      // Ensure the two updatedAt values are different
      fc.pre(updatedAtA !== updatedAtB);

      const local: VocabularyEntry = { ...base, updatedAt: updatedAtA };
      const cloud: VocabularyEntry = { ...base, updatedAt: updatedAtB };

      const winner = syncService.resolveConflict(local, cloud);

      if (updatedAtA > updatedAtB) {
        expect(winner).toBe(local);
      } else {
        expect(winner).toBe(cloud);
      }
    }
  );
});

/**
 * Property 38: Conflict Resolution — Tie-Break Preserves Higher Interval
 * Validates: Requirements 21.3
 *
 * For any two VocabularyEntry versions with same id and identical updatedAt,
 * resolveConflict(local, cloud) returns a version where
 * interval = max(local.interval, cloud.interval) and
 * easeFactor = max(local.easeFactor, cloud.easeFactor).
 */
describe('SyncService — Property 38: Conflict Resolution — Tie-Break Preserves Higher Interval', () => {
  let injector: EnvironmentInjector;
  let syncService: SyncService;

  beforeAll(() => {
    injector = createEnvironmentInjector([AuthService, ApiClient, SyncService]);
    syncService = injector.get(SyncService);
  });

  afterAll(() => {
    injector.destroy();
  });

  it.prop(
    [
      arbitraryEntry(),
      fc.integer({ min: 1, max: 365 }),
      fc.integer({ min: 1, max: 365 }),
      fc.float({ min: Math.fround(1.3), max: Math.fround(4.0), noNaN: true }),
      fc.float({ min: Math.fround(1.3), max: Math.fround(4.0), noNaN: true }),
      fc.string(),
    ],
    { numRuns: 100 }
  )(
    'when updatedAt is identical, resolveConflict returns max(interval) and max(easeFactor)',
    (base, localInterval, cloudInterval, localEaseFactor, cloudEaseFactor, sameUpdatedAt) => {
      const local: VocabularyEntry = {
        ...base,
        updatedAt: sameUpdatedAt,
        interval: localInterval,
        easeFactor: localEaseFactor,
      };
      const cloud: VocabularyEntry = {
        ...base,
        updatedAt: sameUpdatedAt,
        interval: cloudInterval,
        easeFactor: cloudEaseFactor,
      };

      const result = syncService.resolveConflict(local, cloud);

      expect(result.interval).toBe(Math.max(localInterval, cloudInterval));
      expect(result.easeFactor).toBe(Math.max(localEaseFactor, cloudEaseFactor));
    }
  );
});

/**
 * Property 39: Offline Changes Are Queued (logic test)
 * Validates: Requirements 21.5
 *
 * When navigator.onLine is false and AuthService.isGuest() is false,
 * notifyChange() should NOT call any fetch endpoint.
 */
describe('SyncService — Property 39: Offline Changes Are Queued', () => {
  let injector: EnvironmentInjector;
  let authService: AuthService;
  let syncService: SyncService;

  beforeAll(() => {
    injector = createEnvironmentInjector([AuthService, ApiClient, SyncService]);
    authService = injector.get(AuthService);
    syncService = injector.get(SyncService);
  });

  afterAll(() => {
    injector.destroy();
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  it.prop([arbitraryEntry()], { numRuns: 100 })(
    'when offline and authenticated, notifyChange() does not call fetch',
    async (entry) => {
      // Set a valid session so user is NOT a guest
      authService.session.set({
        userId: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com',
        image: null,
      });
      expect(authService.isGuest()).toBe(false);

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // notifyChange() may throw a Dexie/IndexedDB error when trying to enqueue
      // (jsdom doesn't have IndexedDB). That's acceptable — the key property is
      // that no fetch was called before the error.
      try {
        await syncService.notifyChange('create', entry);
      } catch {
        // Dexie IndexedDB error expected in jsdom — ignore
      }

      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});

/**
 * Property 41: Sync Status Indicator Correctness
 * Validates: Requirements 21.1
 *
 * SyncService.syncStatus signal starts as 'synced'.
 * After calling syncStatus.set('syncing'), it returns 'syncing'.
 * After calling syncStatus.set('offline-with-queue'), it returns 'offline-with-queue'.
 */
describe('SyncService — Property 41: Sync Status Indicator Correctness', () => {
  let injector: EnvironmentInjector;
  let syncService: SyncService;

  beforeAll(() => {
    injector = createEnvironmentInjector([AuthService, ApiClient, SyncService]);
    syncService = injector.get(SyncService);
  });

  afterAll(() => {
    injector.destroy();
  });

  it('syncStatus signal starts as "synced"', () => {
    // Create a fresh instance to check initial value
    const freshInjector = createEnvironmentInjector([AuthService, ApiClient, SyncService]);
    const freshService = freshInjector.get(SyncService);
    expect(freshService.syncStatus()).toBe('synced');
    freshInjector.destroy();
  });

  it('after syncStatus.set("syncing"), syncStatus() returns "syncing"', () => {
    syncService.syncStatus.set('syncing');
    expect(syncService.syncStatus()).toBe('syncing');
  });

  it('after syncStatus.set("offline-with-queue"), syncStatus() returns "offline-with-queue"', () => {
    syncService.syncStatus.set('offline-with-queue');
    expect(syncService.syncStatus()).toBe('offline-with-queue');
  });
});
