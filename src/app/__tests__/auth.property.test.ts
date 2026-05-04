// Feature: vocabulary-memory-app, Properties 29, 30, 31: Auth

import '@angular/compiler';
import { fc, it } from '@fast-check/vitest';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { AuthService, UserSession } from '../services/auth.service';
import { SyncService } from '../services/sync.service';
import { ApiClient } from '../services/api-client';

/**
 * Property 29: Auth Session Display
 * Validates: Requirements 17.3
 *
 * For any valid UserSession (userId: string, name: string|null, email: string|null,
 * image: string|null), AuthService.session() set to that value should make
 * isAuthenticated() return true and isGuest() return false.
 */

const userSessionArb = fc.record({
  userId: fc.string({ minLength: 1 }),
  name: fc.option(fc.string(), { nil: null }),
  email: fc.option(fc.string(), { nil: null }),
  image: fc.option(fc.string(), { nil: null }),
}) as fc.Arbitrary<UserSession>;

describe('AuthService — Property 29: Auth Session Display', () => {
  it.prop([userSessionArb], { numRuns: 100 })(
    'when session is set to a valid UserSession, isAuthenticated() returns true and isGuest() returns false',
    (session) => {
      const service = new AuthService();
      service.session.set(session);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.isGuest()).toBe(false);
    }
  );
});

/**
 * Property 30: Auth Failure Preserves Local Data
 * Validates: Requirements 17.5
 *
 * When AuthService.session is null (failed/cancelled OAuth), isGuest() returns
 * true and isAuthenticated() returns false.
 */
describe('AuthService — Property 30: Auth Failure Preserves Local Data', () => {
  it('when session is null, isGuest() returns true and isAuthenticated() returns false', () => {
    const service = new AuthService();
    service.session.set(null);
    expect(service.isGuest()).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
  });

  it.prop([fc.constant(null)], { numRuns: 100 })(
    'isGuest() is always true and isAuthenticated() is always false when session is null',
    (_nullValue) => {
      const service = new AuthService();
      service.session.set(null);
      expect(service.isGuest()).toBe(true);
      expect(service.isAuthenticated()).toBe(false);
    }
  );
});

/**
 * Property 31: Guest Mode Isolation
 * Validates: Requirements 17.7, 21.6
 *
 * When AuthService.isGuest() is true (session is null), SyncService.notifyChange()
 * should return without making any API calls.
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

describe('SyncService — Property 31: Guest Mode Isolation', () => {
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
    // Ensure guest mode: session is null
    authService.session.set(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.prop([arbitraryEntry()], { numRuns: 100 })(
    'when isGuest() is true, notifyChange("create") does not call fetch for any entry',
    async (entry) => {
      expect(authService.isGuest()).toBe(true);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await syncService.notifyChange('create', entry);

      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it.prop([arbitraryEntry()], { numRuns: 100 })(
    'when isGuest() is true, notifyChange("update") does not call fetch',
    async (entry) => {
      expect(authService.isGuest()).toBe(true);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await syncService.notifyChange('update', entry);

      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it.prop([arbitraryEntry()], { numRuns: 100 })(
    'when isGuest() is true, notifyChange("delete") does not call fetch',
    async (entry) => {
      expect(authService.isGuest()).toBe(true);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await syncService.notifyChange('delete', entry);

      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});
