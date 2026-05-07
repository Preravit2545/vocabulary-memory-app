/**
 * Preservation Property Tests — Progress Sync Inconsistency Bugfix
 *
 * These tests encode BASELINE behavior that MUST be preserved after the fix.
 * They MUST PASS on the current UNFIXED code.
 * They document what non-buggy paths do today so regressions are caught.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 *
 * Behaviors preserved:
 *   P1 — Vocabulary CRUD online: notifyChange() calls correct API + sets syncStatus='synced'
 *   P2 — Guest mode: no API calls for any operation
 *   P3 — Online syncReviewSession() success: session pushed immediately, nothing queued
 *   P4 — processSyncQueue() dispatches 'create'/'update'/'delete' to correct API methods
 */

import '@angular/compiler';
import { fc, it } from '@fast-check/vitest';
import { describe, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { SyncService } from '../services/sync.service';
import { AuthService } from '../services/auth.service';
import { ApiClient } from '../services/api-client';
import { VocabularyEntry, ReviewSession, PendingChange } from '../models/vocabulary-entry.model';

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

/** Arbitrary for a valid VocabularyEntry */
const arbitraryEntry = () =>
  fc.record({
    id: fc.uuid(),
    word: fc.string({ minLength: 1, maxLength: 50 }),
    translation: fc.string({ minLength: 1, maxLength: 100 }),
    originalSentence: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    notes: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    exampleSentences: fc.array(fc.string({ maxLength: 100 }), { maxLength: 5 }),
    synonyms: fc.array(fc.string({ maxLength: 50 }), { maxLength: 5 }),
    antonyms: fc.array(fc.string({ maxLength: 50 }), { maxLength: 5 }),
    mnemonic: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    interval: fc.integer({ min: 1, max: 365 }),
    easeFactor: fc.float({ min: Math.fround(1.3), max: Math.fround(4.0), noNaN: true }),
    nextReviewDate: fc.string({ minLength: 10, maxLength: 10 }),
    reviewCount: fc.nat(),
    createdAt: fc.string({ minLength: 1 }),
    updatedAt: fc.string({ minLength: 1 }),
  });

/** Arbitrary for a valid ReviewSession */
const arbitrarySession = () =>
  fc.record({
    id: fc.uuid(),
    date: fc.string({ minLength: 10, maxLength: 10 }),
    reviewedCount: fc.nat({ max: 200 }),
    completedAt: fc.string({ minLength: 1 }),
  });

/** Arbitrary for vocabulary CRUD operation type */
const arbitraryVocabOp = () =>
  fc.constantFrom('create' as const, 'update' as const, 'delete' as const);

// ── Preservation Property 1: Vocabulary CRUD online ──────────────────────────
//
// For all vocabulary CRUD operations while online and authenticated,
// notifyChange() calls the correct API method and sets syncStatus to 'synced'.
//
// Validates: Requirement 3.4
// ─────────────────────────────────────────────────────────────────────────────

describe('Preservation P1 — Vocabulary CRUD online: correct API call + syncStatus="synced"', () => {
  let injector: EnvironmentInjector;
  let authService: AuthService;
  let syncService: SyncService;

  let createSpy: ReturnType<typeof vi.fn>;
  let updateSpy: ReturnType<typeof vi.fn>;
  let deleteSpy: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    createSpy = vi.fn().mockResolvedValue({});
    updateSpy = vi.fn().mockResolvedValue({});
    deleteSpy = vi.fn().mockResolvedValue(undefined);

    const mockApiClient = {
      getVocabulary: vi.fn().mockResolvedValue([]),
      getReviewSessions: vi.fn().mockResolvedValue([]),
      createVocabularyEntry: createSpy,
      updateVocabularyEntry: updateSpy,
      deleteVocabularyEntry: deleteSpy,
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
  });

  afterAll(() => {
    injector?.destroy();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    createSpy.mockClear();
    updateSpy.mockClear();
    deleteSpy.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  /**
   * Validates: Requirement 3.4
   *
   * For any vocabulary entry and any CRUD operation, when online and authenticated,
   * notifyChange() calls the correct API method exactly once.
   */
  it.prop([arbitraryEntry(), arbitraryVocabOp()], { numRuns: 50 })(
    'notifyChange() calls the correct API method for each operation type when online',
    async (entry, op) => {
      createSpy.mockClear();
      updateSpy.mockClear();
      deleteSpy.mockClear();

      await syncService.notifyChange(op, entry);

      if (op === 'create') {
        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(createSpy).toHaveBeenCalledWith(entry);
        expect(updateSpy).not.toHaveBeenCalled();
        expect(deleteSpy).not.toHaveBeenCalled();
      } else if (op === 'update') {
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith(entry.id, entry);
        expect(createSpy).not.toHaveBeenCalled();
        expect(deleteSpy).not.toHaveBeenCalled();
      } else if (op === 'delete') {
        expect(deleteSpy).toHaveBeenCalledTimes(1);
        expect(deleteSpy).toHaveBeenCalledWith(entry.id);
        expect(createSpy).not.toHaveBeenCalled();
        expect(updateSpy).not.toHaveBeenCalled();
      }
    }
  );

  /**
   * Validates: Requirement 3.4
   *
   * For any vocabulary entry and any CRUD operation, when online and authenticated,
   * notifyChange() sets syncStatus to 'synced' after a successful API call.
   */
  it.prop([arbitraryEntry(), arbitraryVocabOp()], { numRuns: 50 })(
    'notifyChange() sets syncStatus to "synced" after successful online API call',
    async (entry, op) => {
      await syncService.notifyChange(op, entry);

      expect(syncService.syncStatus()).toBe('synced');
    }
  );
});

// ── Preservation Property 2: Guest mode — no API calls ───────────────────────
//
// For all operations in guest mode (isGuest() = true), no API calls are made.
//
// Validates: Requirement 3.2
// ─────────────────────────────────────────────────────────────────────────────

describe('Preservation P2 — Guest mode: no API calls for any operation', () => {
  let injector: EnvironmentInjector;
  let authService: AuthService;
  let syncService: SyncService;
  let apiCallSpy: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    apiCallSpy = vi.fn();

    const mockApiClient = {
      getVocabulary: apiCallSpy,
      getReviewSessions: apiCallSpy,
      createVocabularyEntry: apiCallSpy,
      updateVocabularyEntry: apiCallSpy,
      deleteVocabularyEntry: apiCallSpy,
      createReviewSession: apiCallSpy,
    };

    injector = createEnvironmentInjector([
      AuthService,
      { provide: ApiClient, useValue: mockApiClient },
      SyncService,
    ], null as any);

    authService = injector.get(AuthService);
    syncService = injector.get(SyncService);

    // Guest mode: no session set
    authService.session.set(null);
  });

  afterAll(() => {
    injector?.destroy();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    apiCallSpy.mockClear();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  /**
   * Validates: Requirement 3.2
   *
   * For any vocabulary entry and any CRUD operation in guest mode,
   * notifyChange() makes no API calls.
   */
  it.prop([arbitraryEntry(), arbitraryVocabOp()], { numRuns: 50 })(
    'notifyChange() makes no API calls in guest mode',
    async (entry, op) => {
      expect(authService.isGuest()).toBe(true);

      apiCallSpy.mockClear();
      await syncService.notifyChange(op, entry);

      expect(apiCallSpy).not.toHaveBeenCalled();
    }
  );

  /**
   * Validates: Requirement 3.2
   *
   * For any review session in guest mode, syncReviewSession() makes no API calls.
   */
  it.prop([arbitrarySession()], { numRuns: 50 })(
    'syncReviewSession() makes no API calls in guest mode',
    async (session) => {
      expect(authService.isGuest()).toBe(true);

      apiCallSpy.mockClear();
      await syncService.syncReviewSession(session);

      expect(apiCallSpy).not.toHaveBeenCalled();
    }
  );

  /**
   * Validates: Requirement 3.2
   *
   * In guest mode, initialSync() makes no API calls.
   */
  it('initialSync() makes no API calls in guest mode', async () => {
    expect(authService.isGuest()).toBe(true);

    apiCallSpy.mockClear();
    await syncService.initialSync();

    expect(apiCallSpy).not.toHaveBeenCalled();
  });
});

// ── Preservation Property 3: Online syncReviewSession() success ───────────────
//
// For all successful online syncReviewSession() calls, session is pushed
// immediately and db.syncQueue remains empty.
//
// Validates: Requirement 3.3
// ─────────────────────────────────────────────────────────────────────────────

describe('Preservation P3 — Online syncReviewSession() success: pushed immediately, nothing queued', () => {
  let injector: EnvironmentInjector;
  let authService: AuthService;
  let syncService: SyncService;
  let createReviewSessionSpy: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    createReviewSessionSpy = vi.fn().mockResolvedValue({});

    const mockApiClient = {
      getVocabulary: vi.fn().mockResolvedValue([]),
      getReviewSessions: vi.fn().mockResolvedValue([]),
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
  });

  afterAll(() => {
    injector?.destroy();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    createReviewSessionSpy.mockClear();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirement 3.3
   *
   * For any review session, when online and authenticated and API succeeds,
   * syncReviewSession() calls apiClient.createReviewSession() exactly once
   * with the session data.
   */
  it.prop([arbitrarySession()], { numRuns: 50 })(
    'syncReviewSession() calls apiClient.createReviewSession() exactly once when online and successful',
    async (session) => {
      createReviewSessionSpy.mockClear();

      await syncService.syncReviewSession(session);

      expect(createReviewSessionSpy).toHaveBeenCalledTimes(1);
      expect(createReviewSessionSpy).toHaveBeenCalledWith(session);
    }
  );

  /**
   * Validates: Requirement 3.3
   *
   * For any review session, when online and authenticated and API succeeds,
   * syncReviewSession() does NOT add anything to db.syncQueue.
   */
  it.prop([arbitrarySession()], { numRuns: 50 })(
    'syncReviewSession() does not add to syncQueue when online and successful',
    async (session) => {
      const { db } = await import('../db/vocab-memory-db');
      const addedItems: any[] = [];
      const addSpy = vi.spyOn(db.syncQueue, 'add').mockImplementation(async (item: any) => {
        addedItems.push(item);
        return item.id;
      });

      await syncService.syncReviewSession(session);

      expect(addSpy).not.toHaveBeenCalled();
      expect(addedItems.length).toBe(0);

      addSpy.mockRestore();
    }
  );
});

// ── Preservation Property 4: processSyncQueue() dispatches to correct API ────
//
// For all PendingChange records with 'create'/'update'/'delete' operations,
// processSyncQueue() dispatches each to the correct API method.
//
// Validates: Requirement 3.6
// ─────────────────────────────────────────────────────────────────────────────

describe('Preservation P4 — processSyncQueue() dispatches each operation to correct API method', () => {
  let injector: EnvironmentInjector;
  let authService: AuthService;
  let syncService: SyncService;

  let createSpy: ReturnType<typeof vi.fn>;
  let updateSpy: ReturnType<typeof vi.fn>;
  let deleteSpy: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    createSpy = vi.fn().mockResolvedValue({});
    updateSpy = vi.fn().mockResolvedValue({});
    deleteSpy = vi.fn().mockResolvedValue(undefined);

    const mockApiClient = {
      getVocabulary: vi.fn().mockResolvedValue([]),
      getReviewSessions: vi.fn().mockResolvedValue([]),
      createVocabularyEntry: createSpy,
      updateVocabularyEntry: updateSpy,
      deleteVocabularyEntry: deleteSpy,
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
  });

  afterAll(() => {
    injector?.destroy();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    createSpy.mockClear();
    updateSpy.mockClear();
    deleteSpy.mockClear();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirement 3.6
   *
   * For any set of PendingChange records with 'create'/'update'/'delete' operations,
   * processSyncQueue() dispatches each to the correct API method.
   */
  it.prop(
    [
      fc.array(
        fc.record({
          id: fc.uuid(),
          operation: fc.constantFrom('create' as const, 'update' as const, 'delete' as const),
          entryId: fc.uuid(),
          payload: arbitraryEntry(),
          createdAt: fc.string({ minLength: 1 }),
          retryCount: fc.integer({ min: 0, max: 2 }),
          nextRetryAt: fc.string({ minLength: 1 }),
        }),
        { minLength: 1, maxLength: 10 }
      ),
    ],
    { numRuns: 50 }
  )(
    'processSyncQueue() dispatches each pending change to the correct API method',
    async (pendingChanges) => {
      const { db } = await import('../db/vocab-memory-db');

      createSpy.mockClear();
      updateSpy.mockClear();
      deleteSpy.mockClear();

      // Mock the syncQueue to return our test data
      vi.spyOn(db.syncQueue, 'orderBy').mockReturnValue({
        toArray: vi.fn().mockResolvedValue(pendingChanges),
      } as any);
      vi.spyOn(db.syncQueue, 'delete').mockResolvedValue(undefined);
      vi.spyOn(db.syncQueue, 'update').mockResolvedValue(1);
      vi.spyOn(db.syncQueue, 'count').mockResolvedValue(0);

      await syncService.processSyncQueue();

      // Count expected calls per operation type (only retryCount < 3)
      const eligible = pendingChanges.filter(c => c.retryCount < 3);
      const expectedCreates = eligible.filter(c => c.operation === 'create').length;
      const expectedUpdates = eligible.filter(c => c.operation === 'update').length;
      const expectedDeletes = eligible.filter(c => c.operation === 'delete').length;

      expect(createSpy).toHaveBeenCalledTimes(expectedCreates);
      expect(updateSpy).toHaveBeenCalledTimes(expectedUpdates);
      expect(deleteSpy).toHaveBeenCalledTimes(expectedDeletes);

      // Verify each create call used the correct payload
      const createChanges = eligible.filter(c => c.operation === 'create');
      createChanges.forEach((change, i) => {
        expect(createSpy).toHaveBeenNthCalledWith(i + 1, change.payload);
      });

      // Verify each update call used the correct entryId and payload
      const updateChanges = eligible.filter(c => c.operation === 'update');
      updateChanges.forEach((change, i) => {
        expect(updateSpy).toHaveBeenNthCalledWith(i + 1, change.entryId, change.payload);
      });

      // Verify each delete call used the correct entryId
      const deleteChanges = eligible.filter(c => c.operation === 'delete');
      deleteChanges.forEach((change, i) => {
        expect(deleteSpy).toHaveBeenNthCalledWith(i + 1, change.entryId);
      });
    }
  );

  /**
   * Validates: Requirement 3.6
   *
   * processSyncQueue() skips changes with retryCount >= 3 (max retries reached).
   * This is existing behavior that must be preserved.
   */
  it('processSyncQueue() skips changes with retryCount >= 3', async () => {
    const { db } = await import('../db/vocab-memory-db');

    const entry = {
      id: 'entry-1',
      word: 'test',
      translation: 'ทดสอบ',
      exampleSentences: [],
      synonyms: [],
      antonyms: [],
      interval: 1,
      easeFactor: 2.5,
      nextReviewDate: '2025-01-01',
      reviewCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const exhaustedChange: PendingChange = {
      id: 'change-exhausted',
      operation: 'create',
      entryId: entry.id,
      payload: entry,
      createdAt: new Date().toISOString(),
      retryCount: 3, // max retries reached
      nextRetryAt: new Date().toISOString(),
    };

    createSpy.mockClear();

    vi.spyOn(db.syncQueue, 'orderBy').mockReturnValue({
      toArray: vi.fn().mockResolvedValue([exhaustedChange]),
    } as any);
    vi.spyOn(db.syncQueue, 'delete').mockResolvedValue(undefined);
    vi.spyOn(db.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(db.syncQueue, 'count').mockResolvedValue(1);

    await syncService.processSyncQueue();

    // Change with retryCount >= 3 should be skipped
    expect(createSpy).not.toHaveBeenCalled();
  });

  /**
   * Validates: Requirement 3.6
   *
   * When processSyncQueue() is called with an empty queue, syncStatus is set to 'synced'.
   * This is existing behavior that must be preserved.
   */
  it('processSyncQueue() sets syncStatus to "synced" when queue is empty', async () => {
    const { db } = await import('../db/vocab-memory-db');

    vi.spyOn(db.syncQueue, 'orderBy').mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    } as any);
    vi.spyOn(db.syncQueue, 'count').mockResolvedValue(0);

    await syncService.processSyncQueue();

    expect(syncService.syncStatus()).toBe('synced');
    expect(syncService.pendingCount()).toBe(0);
  });
});

// ── Preservation Property 5: Vocabulary offline queuing ──────────────────────
//
// For all vocabulary CRUD operations while offline and authenticated,
// notifyChange() adds the change to db.syncQueue and sets syncStatus to
// 'offline-with-queue'. This is existing behavior that must be preserved.
//
// Validates: Requirement 3.4
// ─────────────────────────────────────────────────────────────────────────────

describe('Preservation P5 — Vocabulary offline: changes queued, syncStatus="offline-with-queue"', () => {
  let injector: EnvironmentInjector;
  let authService: AuthService;
  let syncService: SyncService;

  beforeAll(() => {
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
  });

  afterAll(() => {
    injector?.destroy();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirement 3.4
   *
   * For any vocabulary entry and any CRUD operation while offline,
   * notifyChange() adds the change to db.syncQueue and sets syncStatus to
   * 'offline-with-queue'.
   */
  it.prop([arbitraryEntry(), arbitraryVocabOp()], { numRuns: 50 })(
    'notifyChange() queues change and sets syncStatus to "offline-with-queue" when offline',
    async (entry, op) => {
      const { db } = await import('../db/vocab-memory-db');

      const addedItems: any[] = [];
      vi.spyOn(db.syncQueue, 'add').mockImplementation(async (item: any) => {
        addedItems.push(item);
        return item.id;
      });
      vi.spyOn(db.syncQueue, 'count').mockResolvedValue(addedItems.length + 1);

      await syncService.notifyChange(op, entry);

      // Change should be queued
      expect(addedItems.length).toBe(1);
      expect(addedItems[0].operation).toBe(op);
      expect(addedItems[0].entryId).toBe(entry.id);

      // syncStatus should be 'offline-with-queue'
      expect(syncService.syncStatus()).toBe('offline-with-queue');
    }
  );
});
