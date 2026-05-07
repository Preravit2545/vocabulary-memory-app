/**
 * Bug Condition Exploration Tests — Progress Sync Inconsistency
 *
 * These tests encode the EXPECTED (fixed) behavior for all 4 root causes.
 * They MUST FAIL on unfixed code — failure confirms the bugs exist.
 * They will PASS after the fix is implemented (Task 3).
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 *
 * Root causes under test:
 *   RC1 — ProgressComponent loads stale stats before initialSync() completes
 *   RC2 — initialSync() is one-way only (cloud→local); local-only sessions not pushed
 *   RC3 — syncReviewSession() drops failed sessions (no queue/retry)
 *   RC4 — ProgressComponent is not reactive to syncStatus changes
 */

import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEnvironmentInjector,
  runInInjectionContext,
  EnvironmentInjector,
  signal,
  effect,
  ɵChangeDetectionScheduler as ChangeDetectionScheduler,
  ɵEffectScheduler as EffectScheduler,
} from '@angular/core';

// Minimal no-op ChangeDetectionScheduler required by Angular effect() in test environments
class NoopChangeDetectionScheduler extends ChangeDetectionScheduler {
  override notify(): void {}
  override runningTick = false;
}
import { SyncService } from '../services/sync.service';
import { AuthService } from '../services/auth.service';
import { ApiClient } from '../services/api-client';
import { ProgressComponent } from '../components/progress/progress.component';
import { VocabularyStoreService } from '../services/vocabulary-store.service';
import { StreakService } from '../services/streak.service';
import { ReviewSession, VocabularyEntry } from '../models/vocabulary-entry.model';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReviewSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    id: `session-${Math.random().toString(36).slice(2)}`,
    date: new Date().toISOString().slice(0, 10),
    reviewedCount: 5,
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeVocabEntry(overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  const now = new Date().toISOString();
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    word: 'test',
    translation: 'ทดสอบ',
    exampleSentences: [],
    synonyms: [],
    antonyms: [],
    interval: 1,
    easeFactor: 2.5,
    nextReviewDate: now.slice(0, 10),
    reviewCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── Test 1a — ProgressComponent loads stale stats before sync ─────────────────
//
// Root Cause 1 & 4:
//   ProgressComponent calls loadStats() in ngOnInit() immediately, reading from
//   an empty IndexedDB. It does NOT wait for initialSync() to complete, and it
//   does NOT react to syncStatus changes.
//
// Expected (fixed) behavior:
//   When syncStatus transitions to 'synced', ProgressComponent reloads stats
//   from the now-populated IndexedDB and shows non-zero values.
//
// This test FAILS on unfixed code because ProgressComponent never reloads after
// syncStatus changes to 'synced'.
// ─────────────────────────────────────────────────────────────────────────────

describe('Test 1a — ProgressComponent loads stale stats before sync (RC1 & RC4)', () => {
  let injector: EnvironmentInjector;

  afterEach(() => {
    injector?.destroy();
    vi.clearAllMocks();
  });

  /**
   * Validates: Requirements 1.1, 1.4
   *
   * Scenario: syncStatus starts as 'syncing' (initialSync in progress).
   * IndexedDB is empty at ngOnInit() time.
   * After ngOnInit(), syncStatus transitions to 'synced'.
   *
   * EXPECTED (fixed): ProgressComponent calls loadStats() again after 'synced',
   * so stats reflect the post-sync IndexedDB state.
   *
   * ACTUAL (unfixed): loadStats() is only called once in ngOnInit(); the
   * component never reacts to syncStatus changes, so stats remain stale zeros.
   */
  it('should reload stats when syncStatus transitions to "synced" after ngOnInit()', async () => {
    // Arrange: syncStatus starts as 'syncing'
    const syncStatusSignal = signal<'synced' | 'syncing' | 'offline-with-queue'>('syncing');

    // Track how many times loadStats-equivalent is triggered
    let loadStatsCallCount = 0;

    const mockVocabStore = {
      getAllEntries: vi.fn().mockImplementation(async () => {
        loadStatsCallCount++;
        // Return non-empty data to simulate post-sync state
        return [makeVocabEntry({ interval: 30 })]; // mastered entry
      }),
    };

    const mockStreakService = {
      getProgressStats: vi.fn().mockReturnValue({
        streak: 7,
        totalWords: 50,
        dueToday: 5,
        mastered: 10,
      }),
    };

    const mockSyncService = {
      syncStatus: syncStatusSignal,
      pendingCount: signal(0),
      initialSync: vi.fn().mockResolvedValue(undefined),
      notifyChange: vi.fn().mockResolvedValue(undefined),
    };

    // Mock db.reviewSessions.toArray() to avoid IndexedDB errors in jsdom
    const { db } = await import('../db/vocab-memory-db');
    vi.spyOn(db.reviewSessions, 'toArray').mockResolvedValue([]);

    injector = createEnvironmentInjector([
      { provide: VocabularyStoreService, useValue: mockVocabStore },
      { provide: StreakService, useValue: mockStreakService },
      { provide: SyncService, useValue: mockSyncService },
      { provide: ChangeDetectionScheduler, useClass: NoopChangeDetectionScheduler },
      EffectScheduler,
      AuthService,
      ApiClient,
    ], null as any);

    const component = runInInjectionContext(injector, () => new ProgressComponent());
    const effectScheduler = injector.get(EffectScheduler);

    // Act: call ngOnInit() while syncStatus is 'syncing'
    await component.ngOnInit();

    // Wait for async loadStats() to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    const callsAfterInit = loadStatsCallCount;

    // Simulate initialSync() completing — syncStatus transitions to 'synced'
    syncStatusSignal.set('synced');
    effectScheduler.flush();

    // Allow Angular effects to flush
    await new Promise(resolve => setTimeout(resolve, 10));

    // Assert: loadStats() should have been called again after 'synced'
    // On UNFIXED code: loadStatsCallCount === callsAfterInit (no reactive reload)
    // On FIXED code:   loadStatsCallCount > callsAfterInit (reactive reload happened)
    expect(loadStatsCallCount).toBeGreaterThan(callsAfterInit);

    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirements 1.1, 1.4
   *
   * Scenario: ProgressComponent is initialized while syncStatus is 'syncing'.
   * After sync completes ('synced'), stats should reflect cloud data (non-zero).
   *
   * EXPECTED (fixed): stats() shows non-zero values after syncStatus → 'synced'.
   * ACTUAL (unfixed): stats() shows zeros because loadStats() was called before
   * sync populated IndexedDB, and no reload happens after sync.
   */
  it('should show non-zero stats after syncStatus transitions to "synced"', async () => {
    const syncStatusSignal = signal<'synced' | 'syncing' | 'offline-with-queue'>('syncing');

    // First call (during ngOnInit while syncing): empty DB
    // Second call (after 'synced'): populated DB
    let callCount = 0;
    const mockVocabStore = {
      getAllEntries: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return []; // empty before sync
        return [makeVocabEntry({ interval: 30 })]; // populated after sync
      }),
    };

    const mockStreakService = {
      getProgressStats: vi.fn().mockImplementation(
        (entries: VocabularyEntry[], _sessions: ReviewSession[]) => ({
          streak: 0,
          totalWords: entries.length,
          dueToday: 0,
          mastered: entries.filter(e => e.interval >= 21).length,
        })
      ),
    };

    const mockSyncService = {
      syncStatus: syncStatusSignal,
      pendingCount: signal(0),
      initialSync: vi.fn().mockResolvedValue(undefined),
      notifyChange: vi.fn().mockResolvedValue(undefined),
    };

    // Mock the db module to avoid IndexedDB errors in jsdom
    const { db } = await import('../db/vocab-memory-db');
    vi.spyOn(db.reviewSessions, 'toArray').mockResolvedValue([]);

    injector = createEnvironmentInjector([
      { provide: VocabularyStoreService, useValue: mockVocabStore },
      { provide: StreakService, useValue: mockStreakService },
      { provide: SyncService, useValue: mockSyncService },
      { provide: ChangeDetectionScheduler, useClass: NoopChangeDetectionScheduler },
      EffectScheduler,
      AuthService,
      ApiClient,
    ], null as any);

    const component = runInInjectionContext(injector, () => new ProgressComponent());
    const effectScheduler = injector.get(EffectScheduler);

    await component.ngOnInit();

    // Wait for the async loadStats() to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Stats after ngOnInit() with empty DB: should be zeros
    const statsBeforeSync = component.stats();
    expect(statsBeforeSync?.totalWords).toBe(0);

    // Simulate sync completing
    syncStatusSignal.set('synced');
    effectScheduler.flush();
    await new Promise(resolve => setTimeout(resolve, 10));

    // EXPECTED (fixed): stats now reflect post-sync data (totalWords > 0)
    // ACTUAL (unfixed): stats still show zeros (no reactive reload)
    const statsAfterSync = component.stats();
    expect(statsAfterSync?.totalWords).toBeGreaterThan(0);

    vi.restoreAllMocks();
  });
});

// ── Test 1b — initialSync() one-way only ─────────────────────────────────────
//
// Root Cause 2:
//   initialSync() only pulls cloud sessions into local IndexedDB.
//   It does NOT push local-only sessions (sessions that exist locally but not
//   in the cloud) up to the cloud.
//
// Expected (fixed) behavior:
//   For every local session whose ID is not in the cloud session list,
//   apiClient.createReviewSession() is called during initialSync().
//
// This test FAILS on unfixed code because initialSync() never calls
// apiClient.createReviewSession() for local-only sessions.
// ─────────────────────────────────────────────────────────────────────────────

describe('Test 1b — initialSync() one-way only (RC2)', () => {
  let injector: EnvironmentInjector;
  let syncService: SyncService;
  let authService: AuthService;

  afterEach(() => {
    injector?.destroy();
    vi.clearAllMocks();
  });

  /**
   * Validates: Requirements 1.2
   *
   * Scenario: Local IndexedDB has 3 sessions that are NOT present in the cloud.
   * Cloud has 0 sessions.
   *
   * EXPECTED (fixed): initialSync() calls apiClient.createReviewSession() for
   * each of the 3 local-only sessions (call count = 3).
   *
   * ACTUAL (unfixed): initialSync() never calls apiClient.createReviewSession()
   * for local-only sessions (call count = 0).
   */
  it('should push local-only sessions to cloud during initialSync()', async () => {
    const localOnlySessions = [
      makeReviewSession({ id: 'local-session-1' }),
      makeReviewSession({ id: 'local-session-2' }),
      makeReviewSession({ id: 'local-session-3' }),
    ];

    const createReviewSessionSpy = vi.fn().mockResolvedValue({});

    const mockApiClient = {
      getVocabulary: vi.fn().mockResolvedValue([]),
      getReviewSessions: vi.fn().mockResolvedValue([]), // cloud has NO sessions
      createVocabularyEntry: vi.fn().mockResolvedValue({}),
      updateVocabularyEntry: vi.fn().mockResolvedValue({}),
      deleteVocabularyEntry: vi.fn().mockResolvedValue(undefined),
      createReviewSession: createReviewSessionSpy,
    };

    injector = createEnvironmentInjector([
      AuthService,
      { provide: ApiClient, useValue: mockApiClient },
      SyncService,
    ], null as any);

    authService = injector.get(AuthService);
    syncService = injector.get(SyncService);

    // Set authenticated user
    authService.session.set({
      userId: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      image: null,
    });

    // Seed local IndexedDB with sessions not in cloud
    // We mock the db.reviewSessions.toArray() by patching the db module
    // Since jsdom doesn't have real IndexedDB, we test the logic via
    // a controlled mock of the db layer within SyncService.
    //
    // We verify the behavior by checking that createReviewSession is called
    // for local-only sessions. On unfixed code, this call count will be 0.

    // Patch navigator.onLine to true
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    // We need to mock the db module used inside SyncService.
    // The db is imported directly in sync.service.ts, so we mock it via
    // vi.mock at module level. Since we can't do that here, we test the
    // observable behavior: after initialSync(), createReviewSession call count.
    //
    // For this test, we simulate the scenario by directly testing the
    // SyncService.initialSync() behavior with mocked API responses.
    // The key assertion is: createReviewSession call count for local-only sessions.

    // Mock the db module used by SyncService
    const { db } = await import('../db/vocab-memory-db');

    // Seed local sessions into IndexedDB (will fail in jsdom, so we mock)
    vi.spyOn(db.reviewSessions, 'toArray').mockResolvedValue(localOnlySessions);
    vi.spyOn(db.reviewSessions, 'get').mockResolvedValue(undefined);
    vi.spyOn(db.vocabulary, 'get').mockResolvedValue(undefined);
    vi.spyOn(db.vocabulary, 'put').mockResolvedValue('');
    vi.spyOn(db.reviewSessions, 'put').mockResolvedValue('');

    await syncService.initialSync();

    // EXPECTED (fixed): createReviewSession called for each local-only session
    // ACTUAL (unfixed): createReviewSession never called for local-only sessions
    expect(createReviewSessionSpy).toHaveBeenCalledTimes(localOnlySessions.length);

    // Restore
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  /**
   * Validates: Requirements 1.2
   *
   * Scenario: Local has 2 sessions; cloud has 1 of them.
   * Only the 1 local-only session should be pushed.
   *
   * EXPECTED (fixed): createReviewSession called exactly once (for the local-only session).
   * ACTUAL (unfixed): createReviewSession never called.
   */
  it('should push only local-only sessions (not sessions already in cloud)', async () => {
    const sharedSession = makeReviewSession({ id: 'shared-session' });
    const localOnlySession = makeReviewSession({ id: 'local-only-session' });

    const createReviewSessionSpy = vi.fn().mockResolvedValue({});

    const mockApiClient = {
      getVocabulary: vi.fn().mockResolvedValue([]),
      getReviewSessions: vi.fn().mockResolvedValue([sharedSession]), // cloud has 1 session
      createVocabularyEntry: vi.fn().mockResolvedValue({}),
      updateVocabularyEntry: vi.fn().mockResolvedValue({}),
      deleteVocabularyEntry: vi.fn().mockResolvedValue(undefined),
      createReviewSession: createReviewSessionSpy,
    };

    injector = createEnvironmentInjector([
      AuthService,
      { provide: ApiClient, useValue: mockApiClient },
      SyncService,
    ], null as any);

    authService = injector.get(AuthService);
    syncService = injector.get(SyncService);

    authService.session.set({
      userId: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      image: null,
    });

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    const { db } = await import('../db/vocab-memory-db');

    // Local has both sessions; cloud only has sharedSession
    vi.spyOn(db.reviewSessions, 'toArray').mockResolvedValue([sharedSession, localOnlySession]);
    vi.spyOn(db.reviewSessions, 'get').mockImplementation(async (id: any) => {
      if (id === sharedSession.id) return sharedSession;
      return undefined;
    });
    vi.spyOn(db.vocabulary, 'get').mockResolvedValue(undefined);
    vi.spyOn(db.vocabulary, 'put').mockResolvedValue('');
    vi.spyOn(db.reviewSessions, 'put').mockResolvedValue('');

    await syncService.initialSync();

    // EXPECTED (fixed): only localOnlySession is pushed (1 call)
    // ACTUAL (unfixed): 0 calls
    expect(createReviewSessionSpy).toHaveBeenCalledTimes(1);
    expect(createReviewSessionSpy).toHaveBeenCalledWith(localOnlySession);

    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});

// ── Test 1c — syncReviewSession() drops failed sessions ──────────────────────
//
// Root Cause 3:
//   syncReviewSession() catches network errors and silently discards the session.
//   The session is never added to db.syncQueue for retry.
//
// Expected (fixed) behavior:
//   When apiClient.createReviewSession() throws, the session is added to
//   db.syncQueue with operation 'create-session'.
//
// This test FAILS on unfixed code because db.syncQueue.count() remains 0
// after a failed syncReviewSession() call.
// ─────────────────────────────────────────────────────────────────────────────

describe('Test 1c — syncReviewSession() drops failed sessions (RC3)', () => {
  let injector: EnvironmentInjector;
  let syncService: SyncService;
  let authService: AuthService;

  afterEach(() => {
    injector?.destroy();
    vi.clearAllMocks();
  });

  /**
   * Validates: Requirements 1.3
   *
   * Scenario: User is authenticated, online, but apiClient.createReviewSession()
   * throws a network error.
   *
   * EXPECTED (fixed): session is added to db.syncQueue (count = 1).
   * ACTUAL (unfixed): session is silently dropped (count = 0).
   */
  it('should add session to syncQueue when createReviewSession() throws', async () => {
    const mockApiClient = {
      getVocabulary: vi.fn().mockResolvedValue([]),
      getReviewSessions: vi.fn().mockResolvedValue([]),
      createVocabularyEntry: vi.fn().mockResolvedValue({}),
      updateVocabularyEntry: vi.fn().mockResolvedValue({}),
      deleteVocabularyEntry: vi.fn().mockResolvedValue(undefined),
      createReviewSession: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    injector = createEnvironmentInjector([
      AuthService,
      { provide: ApiClient, useValue: mockApiClient },
      SyncService,
    ], null as any);

    authService = injector.get(AuthService);
    syncService = injector.get(SyncService);

    authService.session.set({
      userId: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      image: null,
    });

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    const session = makeReviewSession();

    // Mock db.syncQueue to track additions
    const { db } = await import('../db/vocab-memory-db');
    const addedItems: any[] = [];
    vi.spyOn(db.syncQueue, 'add').mockImplementation(async (item: any) => {
      addedItems.push(item);
      return item.id;
    });
    vi.spyOn(db.syncQueue, 'count').mockImplementation(async () => addedItems.length);

    await syncService.syncReviewSession(session);

    // EXPECTED (fixed): session queued for retry (count = 1)
    // ACTUAL (unfixed): session dropped (count = 0)
    const queueCount = await db.syncQueue.count();
    expect(queueCount).toBe(1);

    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  /**
   * Validates: Requirements 1.3
   *
   * Scenario: User is authenticated but offline.
   *
   * EXPECTED (fixed): session is added to db.syncQueue (count = 1).
   * ACTUAL (unfixed): syncReviewSession() returns early without queuing (count = 0).
   */
  it('should add session to syncQueue when offline instead of silently dropping', async () => {
    const mockApiClient = {
      getVocabulary: vi.fn().mockResolvedValue([]),
      getReviewSessions: vi.fn().mockResolvedValue([]),
      createVocabularyEntry: vi.fn().mockResolvedValue({}),
      updateVocabularyEntry: vi.fn().mockResolvedValue({}),
      deleteVocabularyEntry: vi.fn().mockResolvedValue(undefined),
      createReviewSession: vi.fn().mockResolvedValue({}),
    };

    injector = createEnvironmentInjector([
      AuthService,
      { provide: ApiClient, useValue: mockApiClient },
      SyncService,
    ], null as any);

    authService = injector.get(AuthService);
    syncService = injector.get(SyncService);

    authService.session.set({
      userId: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      image: null,
    });

    // Simulate offline
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const session = makeReviewSession();

    const { db } = await import('../db/vocab-memory-db');
    const addedItems: any[] = [];
    vi.spyOn(db.syncQueue, 'add').mockImplementation(async (item: any) => {
      addedItems.push(item);
      return item.id;
    });
    vi.spyOn(db.syncQueue, 'count').mockImplementation(async () => addedItems.length);

    await syncService.syncReviewSession(session);

    // EXPECTED (fixed): session queued (count = 1)
    // ACTUAL (unfixed): early return, nothing queued (count = 0)
    const queueCount = await db.syncQueue.count();
    expect(queueCount).toBe(1);

    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});

// ── Test 1d — ProgressComponent not reactive to syncStatus ───────────────────
//
// Root Cause 4:
//   ProgressComponent does not subscribe to SyncService.syncStatus.
//   After ngOnInit(), if syncStatus changes to 'synced', loadStats() is never
//   called again.
//
// Expected (fixed) behavior:
//   ProgressComponent uses an Angular effect() to watch syncStatus.
//   When syncStatus becomes 'synced', loadStats() is called again.
//
// This test FAILS on unfixed code because ProgressComponent has no effect()
// watching syncStatus, so loadStats() is only called once (in ngOnInit()).
// ─────────────────────────────────────────────────────────────────────────────

describe('Test 1d — ProgressComponent not reactive to syncStatus (RC4)', () => {
  let injector: EnvironmentInjector;

  afterEach(() => {
    injector?.destroy();
    vi.clearAllMocks();
  });

  /**
   * Validates: Requirements 1.4
   *
   * Scenario: After ngOnInit(), syncStatus changes from 'syncing' to 'synced'.
   *
   * EXPECTED (fixed): loadStats() is called again (total calls > 1).
   * ACTUAL (unfixed): loadStats() is only called once in ngOnInit() (total calls = 1).
   */
  it('should call loadStats() again when syncStatus changes to "synced" after ngOnInit()', async () => {
    const syncStatusSignal = signal<'synced' | 'syncing' | 'offline-with-queue'>('syncing');

    let loadStatsCallCount = 0;
    const mockVocabStore = {
      getAllEntries: vi.fn().mockImplementation(async () => {
        loadStatsCallCount++;
        return [];
      }),
    };

    const mockStreakService = {
      getProgressStats: vi.fn().mockReturnValue({
        streak: 0,
        totalWords: 0,
        dueToday: 0,
        mastered: 0,
      }),
    };

    const mockSyncService = {
      syncStatus: syncStatusSignal,
      pendingCount: signal(0),
      initialSync: vi.fn().mockResolvedValue(undefined),
      notifyChange: vi.fn().mockResolvedValue(undefined),
    };

    injector = createEnvironmentInjector([
      { provide: VocabularyStoreService, useValue: mockVocabStore },
      { provide: StreakService, useValue: mockStreakService },
      { provide: SyncService, useValue: mockSyncService },
      { provide: ChangeDetectionScheduler, useClass: NoopChangeDetectionScheduler },
      EffectScheduler,
      AuthService,
      ApiClient,
    ], null as any);

    const component = runInInjectionContext(injector, () => new ProgressComponent());
    const effectScheduler = injector.get(EffectScheduler);

    // Mock db.reviewSessions.toArray() to avoid IndexedDB errors in jsdom
    const { db } = await import('../db/vocab-memory-db');
    vi.spyOn(db.reviewSessions, 'toArray').mockResolvedValue([]);

    // Call ngOnInit() — this triggers the first loadStats()
    await component.ngOnInit();

    // Wait for async loadStats() to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    const callsAfterInit = loadStatsCallCount;
    expect(callsAfterInit).toBe(1); // sanity check: ngOnInit() calls loadStats() once

    // Simulate initialSync() completing
    syncStatusSignal.set('synced');
    effectScheduler.flush();

    // Allow Angular effects to flush
    await new Promise(resolve => setTimeout(resolve, 10));

    // EXPECTED (fixed): loadStats() called again after 'synced' (total > 1)
    // ACTUAL (unfixed): loadStats() not called again (total = 1)
    expect(loadStatsCallCount).toBeGreaterThan(callsAfterInit);

    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirements 1.4
   *
   * Scenario: syncStatus changes to 'syncing' (not 'synced') after ngOnInit().
   * loadStats() should NOT be triggered by non-'synced' status changes.
   *
   * This verifies the reactive behavior is scoped to 'synced' only.
   * (This test should PASS on both fixed and unfixed code — it's a sanity check.)
   */
  it('should NOT call loadStats() again when syncStatus changes to "syncing"', async () => {
    const syncStatusSignal = signal<'synced' | 'syncing' | 'offline-with-queue'>('synced');

    let loadStatsCallCount = 0;
    const mockVocabStore = {
      getAllEntries: vi.fn().mockImplementation(async () => {
        loadStatsCallCount++;
        return [];
      }),
    };

    const mockStreakService = {
      getProgressStats: vi.fn().mockReturnValue({
        streak: 0,
        totalWords: 0,
        dueToday: 0,
        mastered: 0,
      }),
    };

    const mockSyncService = {
      syncStatus: syncStatusSignal,
      pendingCount: signal(0),
      initialSync: vi.fn().mockResolvedValue(undefined),
      notifyChange: vi.fn().mockResolvedValue(undefined),
    };

    injector = createEnvironmentInjector([
      { provide: VocabularyStoreService, useValue: mockVocabStore },
      { provide: StreakService, useValue: mockStreakService },
      { provide: SyncService, useValue: mockSyncService },
      { provide: ChangeDetectionScheduler, useClass: NoopChangeDetectionScheduler },
      EffectScheduler,
      AuthService,
      ApiClient,
    ], null as any);

    const component = runInInjectionContext(injector, () => new ProgressComponent());
    const effectScheduler = injector.get(EffectScheduler);

    // Mock db.reviewSessions.toArray() to avoid IndexedDB errors in jsdom
    const { db } = await import('../db/vocab-memory-db');
    vi.spyOn(db.reviewSessions, 'toArray').mockResolvedValue([]);

    await component.ngOnInit();

    // Wait for async loadStats() to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    const callsAfterInit = loadStatsCallCount;

    // Change to 'syncing' — should NOT trigger loadStats()
    syncStatusSignal.set('syncing');
    effectScheduler.flush();
    await new Promise(resolve => setTimeout(resolve, 10));

    // loadStats() should not have been called again for 'syncing'
    expect(loadStatsCallCount).toBe(callsAfterInit);

    vi.restoreAllMocks();
  });
});
