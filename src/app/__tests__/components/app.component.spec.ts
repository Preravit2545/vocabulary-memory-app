/**
 * Unit tests for App component — PWA install prompt and update banner
 * Validates: Requirements 16.3, 16.4, 16.6
 */

// Enable JIT compilation for Angular decorators in the test environment
import '@angular/compiler';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEnvironmentInjector,
  runInInjectionContext,
  EnvironmentInjector,
  signal,
} from '@angular/core';
import { Subject } from 'rxjs';
import { VersionReadyEvent } from '@angular/service-worker';
import { App } from '../../app';
import { NotificationService } from '../../services/notification.service';
import { SwUpdate } from '@angular/service-worker';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SyncService } from '../../services/sync.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeNotificationServiceMock(shouldShowInstallPromptResult = true) {
  return {
    shouldShowInstallPrompt: vi.fn().mockReturnValue(shouldShowInstallPromptResult),
  };
}

function makeSwUpdateMock() {
  const versionUpdates$ = new Subject<VersionReadyEvent>();
  return {
    isEnabled: true,
    versionUpdates: versionUpdates$.asObservable(),
    activateUpdate: vi.fn().mockResolvedValue(undefined),
    _subject: versionUpdates$,
  };
}

function makeAuthServiceMock(isGuest = true) {
  return {
    session: signal(isGuest ? null : { userId: 'u1', name: 'Test', email: 'test@example.com', image: null }),
    isAuthenticated: signal(!isGuest),
    isGuest: signal(isGuest),
    loadSession: vi.fn().mockResolvedValue(undefined),
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSyncServiceMock() {
  return {
    syncStatus: signal<'synced' | 'syncing' | 'offline-with-queue'>('synced'),
    pendingCount: signal(0),
    initialSync: vi.fn().mockResolvedValue(undefined),
    notifyChange: vi.fn().mockResolvedValue(undefined),
  };
}

// ── test suite ────────────────────────────────────────────────────────────────

describe('App — PWA install prompt and update banner', () => {
  let component: App;
  let mockNotifService: ReturnType<typeof makeNotificationServiceMock>;
  let mockSwUpdate: ReturnType<typeof makeSwUpdateMock>;
  let injector: EnvironmentInjector;

  function createComponent(shouldShowInstallPrompt = true) {
    mockNotifService = makeNotificationServiceMock(shouldShowInstallPrompt);
    mockSwUpdate = makeSwUpdateMock();

    injector = createEnvironmentInjector([
      { provide: NotificationService, useValue: mockNotifService },
      { provide: SwUpdate, useValue: mockSwUpdate },
      { provide: AuthService, useValue: makeAuthServiceMock() },
      { provide: SyncService, useValue: makeSyncServiceMock() },
      RouterOutlet,
      RouterLink,
      RouterLinkActive,
    ], null as any);

    component = runInInjectionContext(injector, () => new App());
  }

  beforeEach(() => {
    localStorage.clear();
    // Replace window.location with a mock object to allow spying on reload
    // jsdom does not allow redefining window.location.reload directly
    const mockLocation = {
      ...window.location,
      reload: vi.fn(),
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: mockLocation,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── 1. Install banner shown when beforeinstallprompt fires ─────────────────

  /**
   * Validates: Requirements 16.3, 16.4
   * When the beforeinstallprompt event fires and shouldShowInstallPrompt returns
   * true, showInstallBanner should become true.
   */
  it('shows install banner when beforeinstallprompt fires and suppression window has passed', () => {
    createComponent(true);
    component.ngOnInit();

    // Simulate the beforeinstallprompt event
    const event = new Event('beforeinstallprompt');
    // Add a mock prompt method to satisfy the BeforeInstallPromptEvent interface
    (event as any).prompt = vi.fn().mockResolvedValue(undefined);
    (event as any).userChoice = Promise.resolve({ outcome: 'dismissed' });

    window.dispatchEvent(event);

    expect(component.showInstallBanner()).toBe(true);
  });

  it('does not show install banner when shouldShowInstallPrompt returns false', () => {
    createComponent(false);
    component.ngOnInit();

    const event = new Event('beforeinstallprompt');
    (event as any).prompt = vi.fn().mockResolvedValue(undefined);
    (event as any).userChoice = Promise.resolve({ outcome: 'dismissed' });

    window.dispatchEvent(event);

    expect(component.showInstallBanner()).toBe(false);
  });

  // ── 2. Banner hidden after dismiss ─────────────────────────────────────────

  /**
   * Validates: Requirement 16.4
   * After calling onDismissInstall(), showInstallBanner should become false.
   */
  it('hides install banner after dismiss', () => {
    createComponent(true);
    component.ngOnInit();

    // Show the banner first
    const event = new Event('beforeinstallprompt');
    (event as any).prompt = vi.fn().mockResolvedValue(undefined);
    (event as any).userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(event);

    expect(component.showInstallBanner()).toBe(true);

    component.onDismissInstall();

    expect(component.showInstallBanner()).toBe(false);
  });

  // ── 3. install_prompt_dismissed_at written to localStorage on dismiss ───────

  /**
   * Validates: Requirement 16.4
   * After onDismissInstall(), localStorage should contain the
   * 'install_prompt_dismissed_at' key.
   */
  it('writes install_prompt_dismissed_at to localStorage on dismiss', () => {
    createComponent(true);
    component.ngOnInit();

    expect(localStorage.getItem('install_prompt_dismissed_at')).toBeNull();

    component.onDismissInstall();

    expect(localStorage.getItem('install_prompt_dismissed_at')).not.toBeNull();
  });

  it('stores a numeric timestamp in install_prompt_dismissed_at', () => {
    createComponent(true);
    component.ngOnInit();

    const before = Date.now();
    component.onDismissInstall();
    const after = Date.now();

    const stored = Number(localStorage.getItem('install_prompt_dismissed_at'));
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(after);
  });

  // ── 4. Update banner shown on VERSION_READY event ──────────────────────────

  /**
   * Validates: Requirement 16.6
   * When SwUpdate emits a VERSION_READY event, showUpdateBanner should become true.
   */
  it('shows update banner when SwUpdate emits a VERSION_READY event', () => {
    createComponent();
    component.ngOnInit();

    expect(component.showUpdateBanner()).toBe(false);

    // Emit a VERSION_READY event
    mockSwUpdate._subject.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'abc123' },
      latestVersion: { hash: 'def456' },
    } as VersionReadyEvent);

    expect(component.showUpdateBanner()).toBe(true);
  });

  // ── 5. Reload triggered on "โหลดใหม่" click ────────────────────────────────

  /**
   * Validates: Requirement 16.6
   * onReload() should call swUpdate.activateUpdate() and window.location.reload().
   */
  it('calls activateUpdate and window.location.reload on onReload()', async () => {
    createComponent();
    component.ngOnInit();

    await component.onReload();

    expect(mockSwUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(window.location.reload).toHaveBeenCalledOnce();
  });
});

// ── Guest Mode banner and sync status tests ───────────────────────────────────

describe('App — Guest Mode banner and sync status', () => {
  let component: App;
  let mockAuthService: ReturnType<typeof makeAuthServiceMock>;
  let mockSyncService: ReturnType<typeof makeSyncServiceMock>;
  let mockSwUpdate: ReturnType<typeof makeSwUpdateMock>;
  let injector: EnvironmentInjector;

  function createComponent(isGuest = true) {
    mockAuthService = makeAuthServiceMock(isGuest);
    mockSyncService = makeSyncServiceMock();
    mockSwUpdate = makeSwUpdateMock();

    injector = createEnvironmentInjector([
      { provide: NotificationService, useValue: makeNotificationServiceMock() },
      { provide: SwUpdate, useValue: mockSwUpdate },
      { provide: AuthService, useValue: mockAuthService },
      { provide: SyncService, useValue: mockSyncService },
      RouterOutlet,
      RouterLink,
      RouterLinkActive,
    ], null as any);

    component = runInInjectionContext(injector, () => new App());
  }

  /**
   * Validates: Requirement 17
   * When the user is a guest, isGuest() is true and showGuestBanner() starts as true.
   */
  it('shows guest mode banner when isGuest is true and showGuestBanner is true', () => {
    createComponent(true);

    expect(component.isGuest()).toBe(true);
    expect(component.showGuestBanner()).toBe(true);
  });

  /**
   * Validates: Requirement 17
   * After setting showGuestBanner to false, it should be false.
   */
  it('hides guest mode banner when showGuestBanner is set to false', () => {
    createComponent(true);

    component.showGuestBanner.set(false);

    expect(component.showGuestBanner()).toBe(false);
  });

  /**
   * Validates: Requirement 17
   * The initial sync status should be 'synced'.
   */
  it("sync status is 'synced' initially", () => {
    createComponent(true);

    expect(component.syncStatus()).toBe('synced');
  });

  /**
   * Validates: Requirement 17
   * When syncStatus is set to 'syncing', the component reflects that.
   */
  it("sync status indicator shows 'syncing' when syncStatus is syncing", () => {
    createComponent(false);

    mockSyncService.syncStatus.set('syncing');

    expect(component.syncStatus()).toBe('syncing');
  });

  /**
   * Validates: Requirement 17
   * When pendingCount is set to 3, the component reflects that.
   */
  it("sync status indicator shows 'offline-with-queue' when pendingCount > 0", () => {
    createComponent(false);

    mockSyncService.pendingCount.set(3);

    expect(component.pendingCount()).toBe(3);
  });

  /**
   * Validates: Requirement 17
   * On ngOnInit(), authService.loadSession should be called.
   */
  it('loadSession is called on init', async () => {
    createComponent(true);

    await component.ngOnInit();

    expect(mockAuthService.loadSession).toHaveBeenCalledOnce();
  });
});
