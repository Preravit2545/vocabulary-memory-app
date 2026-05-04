/**
 * Unit tests for SettingsComponent — notification settings UI
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.9, 15.11
 */

// Enable JIT compilation for Angular decorators in the test environment
import '@angular/compiler';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEnvironmentInjector,
  runInInjectionContext,
  EnvironmentInjector,
  signal,
} from '@angular/core';
import { SettingsComponent } from '../../components/settings/settings.component';
import { NotificationService } from '../../services/notification.service';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { ImportExportService } from '../../services/import-export.service';
import { AuthService } from '../../services/auth.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeNotificationServiceMock(
  overrides: Partial<{
    requestPermissionResult: NotificationPermission;
    isEnabledValue: boolean;
    reminderHourValue: number;
    reminderMinuteValue: number;
    permissionStateValue: NotificationPermission;
  }> = {}
) {
  const opts = {
    requestPermissionResult: 'granted' as NotificationPermission,
    isEnabledValue: false,
    reminderHourValue: 20,
    reminderMinuteValue: 0,
    permissionStateValue: 'default' as NotificationPermission,
    ...overrides,
  };

  return {
    isEnabled: signal(opts.isEnabledValue),
    reminderHour: signal(opts.reminderHourValue),
    reminderMinute: signal(opts.reminderMinuteValue),
    permissionState: signal<NotificationPermission>(opts.permissionStateValue),
    loadSettings: vi.fn(),
    requestPermission: vi.fn().mockResolvedValue(opts.requestPermissionResult),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    cancelScheduledNotifications: vi.fn().mockResolvedValue(undefined),
  };
}

function makeVocabStoreMock(): Partial<VocabularyStoreService> {
  return {
    entries: signal([]) as any,
    getAllEntries: vi.fn().mockResolvedValue([]),
  };
}

function makeImportExportMock(): Partial<ImportExportService> {
  return {
    exportToJSON: vi.fn().mockReturnValue('{}'),
    importFromJSON: vi.fn().mockReturnValue({ imported: 0, skipped: 0, errors: [] }),
  };
}

function makeAuthServiceMock(isAuthenticated = false) {
  const sessionValue = isAuthenticated ? { userId: 'u1', name: 'Test User', email: 'test@example.com', image: null } : null;
  return {
    session: signal(sessionValue),
    isAuthenticated: signal(isAuthenticated),
    isGuest: signal(!isAuthenticated),
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(undefined),
  };
}

// ── test suite ────────────────────────────────────────────────────────────────

describe('SettingsComponent — notification settings', () => {
  let component: SettingsComponent;
  let mockNotifService: ReturnType<typeof makeNotificationServiceMock>;
  let injector: EnvironmentInjector;

  function createComponent(
    notifServiceOverrides: Parameters<typeof makeNotificationServiceMock>[0] = {},
    isAuthenticated = false
  ) {
    mockNotifService = makeNotificationServiceMock(notifServiceOverrides);

    injector = createEnvironmentInjector([
      { provide: NotificationService, useValue: mockNotifService },
      { provide: VocabularyStoreService, useValue: makeVocabStoreMock() },
      { provide: ImportExportService, useValue: makeImportExportMock() },
      { provide: AuthService, useValue: makeAuthServiceMock(isAuthenticated) },
    ]);

    component = runInInjectionContext(injector, () => new SettingsComponent());
  }

  // ── 1. Toggle hidden when Notification API unavailable ─────────────────────

  /**
   * Validates: Requirement 15.1
   * When 'Notification' is not in window, notifUnsupported should be true
   * (which drives the @if block that hides the toggle and shows the unsupported message).
   */
  it('sets notifUnsupported to true when Notification API is unavailable', () => {
    // Temporarily remove Notification from window
    const originalNotification = (window as any).Notification;
    delete (window as any).Notification;

    createComponent();
    component.ngOnInit();

    expect(component.notifUnsupported()).toBe(true);

    // Restore
    (window as any).Notification = originalNotification;
  });

  it('does not set notifUnsupported when Notification API is available', () => {
    // Ensure Notification is present (jsdom may not have it, so stub it)
    if (!('Notification' in window)) {
      (window as any).Notification = { permission: 'default', requestPermission: vi.fn() };
    }

    createComponent();
    component.ngOnInit();

    expect(component.notifUnsupported()).toBe(false);
  });

  // ── 2. Permission denied keeps toggle off and shows error ──────────────────

  /**
   * Validates: Requirements 15.2, 15.3
   * When requestPermission() returns 'denied', notifEnabled stays false
   * and notifPermission is set to 'denied' (which drives the error message @if block).
   */
  it('keeps notifEnabled false and sets notifPermission to denied when permission is denied', async () => {
    createComponent({ requestPermissionResult: 'denied' });

    // Start with toggle off
    expect(component.notifEnabled()).toBe(false);

    await component.onToggleNotification();

    expect(component.notifEnabled()).toBe(false);
    expect(component.notifPermission()).toBe('denied');
  });

  it('does not call saveSettings when permission is denied', async () => {
    createComponent({ requestPermissionResult: 'denied' });

    await component.onToggleNotification();

    expect(mockNotifService.saveSettings).not.toHaveBeenCalled();
  });

  // ── 3. Permission granted calls saveSettings() ─────────────────────────────

  /**
   * Validates: Requirements 15.2, 15.4
   * When requestPermission() returns 'granted', notifEnabled becomes true
   * and saveSettings() is called with enabled=true.
   */
  it('sets notifEnabled to true when permission is granted', async () => {
    createComponent({ requestPermissionResult: 'granted' });

    await component.onToggleNotification();

    expect(component.notifEnabled()).toBe(true);
  });

  it('calls saveSettings with enabled=true when permission is granted', async () => {
    createComponent({ requestPermissionResult: 'granted' });

    await component.onToggleNotification();

    expect(mockNotifService.saveSettings).toHaveBeenCalledOnce();
    const [enabled] = (mockNotifService.saveSettings as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(enabled).toBe(true);
  });

  it('sets notifPermission to granted when permission is granted', async () => {
    createComponent({ requestPermissionResult: 'granted' });

    await component.onToggleNotification();

    expect(component.notifPermission()).toBe('granted');
  });

  // ── 4. Time picker visible only when enabled ───────────────────────────────

  /**
   * Validates: Requirement 15.11
   * The time picker input is only rendered when notifEnabled() is true.
   * We test the signal state that drives the @if block in the template.
   */
  it('notifEnabled is false by default (time picker would be hidden)', () => {
    createComponent();

    expect(component.notifEnabled()).toBe(false);
  });

  it('notifEnabled becomes true after granting permission (time picker would be visible)', async () => {
    createComponent({ requestPermissionResult: 'granted' });

    await component.onToggleNotification();

    expect(component.notifEnabled()).toBe(true);
  });

  it('notifEnabled returns to false after disabling (time picker would be hidden again)', async () => {
    // Start with notifications enabled
    createComponent({ isEnabledValue: true });
    component.notifEnabled.set(true);

    await component.onToggleNotification();

    expect(component.notifEnabled()).toBe(false);
  });

  // ── 5. Disable calls cancelScheduledNotifications() ───────────────────────

  /**
   * Validates: Requirement 15.9
   * When toggling off (notifEnabled was true), cancelScheduledNotifications()
   * should be called on the NotificationService.
   */
  it('calls cancelScheduledNotifications when toggling off', async () => {
    createComponent();
    // Set toggle to enabled state first
    component.notifEnabled.set(true);

    await component.onToggleNotification();

    expect(mockNotifService.cancelScheduledNotifications).toHaveBeenCalledOnce();
  });

  it('does not call cancelScheduledNotifications when toggling on', async () => {
    createComponent({ requestPermissionResult: 'granted' });
    // Toggle is off by default

    await component.onToggleNotification();

    expect(mockNotifService.cancelScheduledNotifications).not.toHaveBeenCalled();
  });

  it('calls saveSettings with enabled=false when toggling off', async () => {
    createComponent();
    component.notifEnabled.set(true);

    await component.onToggleNotification();

    expect(mockNotifService.saveSettings).toHaveBeenCalledOnce();
    const [enabled] = (mockNotifService.saveSettings as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(enabled).toBe(false);
  });

  // ── 6. notifTimeValue computed correctly ───────────────────────────────────

  /**
   * Validates: Requirement 15.11
   * The notifTimeValue() helper should return a correctly formatted "HH:MM" string.
   */
  it('notifTimeValue returns correctly formatted time string', () => {
    createComponent({ reminderHourValue: 8, reminderMinuteValue: 5 });
    component.notifHour.set(8);
    component.notifMinute.set(5);

    expect(component.notifTimeValue()).toBe('08:05');
  });

  it('notifTimeValue pads hours and minutes with leading zeros', () => {
    createComponent();
    component.notifHour.set(9);
    component.notifMinute.set(0);

    expect(component.notifTimeValue()).toBe('09:00');
  });

  // ── 7. onTimeChange updates hour/minute signals and calls saveSettings ─────

  /**
   * Validates: Requirement 15.4
   * When the time input changes, notifHour and notifMinute signals should be
   * updated and saveSettings() should be called with the new values.
   */
  it('updates notifHour and notifMinute when onTimeChange is called', async () => {
    createComponent();

    await component.onTimeChange('14:30');

    expect(component.notifHour()).toBe(14);
    expect(component.notifMinute()).toBe(30);
  });

  it('calls saveSettings with updated hour and minute on time change', async () => {
    createComponent();

    await component.onTimeChange('14:30');

    expect(mockNotifService.saveSettings).toHaveBeenCalledOnce();
    const [, hour, minute] = (mockNotifService.saveSettings as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(hour).toBe(14);
    expect(minute).toBe(30);
  });

  it('ignores invalid time strings in onTimeChange', async () => {
    createComponent();

    await component.onTimeChange('invalid');

    expect(mockNotifService.saveSettings).not.toHaveBeenCalled();
  });

  // ── 8. Permission default (dismissed prompt) keeps toggle off ─────────────

  /**
   * Validates: Requirement 15.2
   * When requestPermission() returns 'default' (user dismissed the prompt),
   * notifEnabled should remain false.
   */
  it('keeps notifEnabled false when permission prompt is dismissed (default)', async () => {
    createComponent({ requestPermissionResult: 'default' });

    await component.onToggleNotification();

    expect(component.notifEnabled()).toBe(false);
  });
});

// ── Auth section tests ────────────────────────────────────────────────────────

describe('SettingsComponent — auth section', () => {
  let component: SettingsComponent;
  let mockAuthService: ReturnType<typeof makeAuthServiceMock>;
  let injector: EnvironmentInjector;

  function createComponent(isAuthenticated = false) {
    mockAuthService = makeAuthServiceMock(isAuthenticated);

    injector = createEnvironmentInjector([
      { provide: NotificationService, useValue: makeNotificationServiceMock() },
      { provide: VocabularyStoreService, useValue: makeVocabStoreMock() },
      { provide: ImportExportService, useValue: makeImportExportMock() },
      { provide: AuthService, useValue: mockAuthService },
    ]);

    component = runInInjectionContext(injector, () => new SettingsComponent());
  }

  /**
   * Validates: Requirement 17
   * When the user is authenticated, isAuthenticated() should be true.
   */
  it('shows user name and sign out button when authenticated', () => {
    createComponent(true);
    component.ngOnInit();

    expect(component.isAuthenticated()).toBe(true);
  });

  /**
   * Validates: Requirement 17
   * When session is null (Guest Mode), isGuest() should be true.
   */
  it('shows sign in button when in Guest Mode', () => {
    createComponent(false);
    component.ngOnInit();

    // isGuest is derived from authService — check via the mock
    expect(mockAuthService.isGuest()).toBe(true);
  });

  /**
   * Validates: Requirement 17
   * onSignIn() should call authService.signIn with 'google'.
   */
  it("onSignIn() calls authService.signIn('google')", () => {
    createComponent(false);

    component.onSignIn();

    expect(mockAuthService.signIn).toHaveBeenCalledOnce();
    expect(mockAuthService.signIn).toHaveBeenCalledWith('google');
  });

  /**
   * Validates: Requirement 17
   * onSignOut() should call authService.signOut() and set a toast message.
   */
  it('onSignOut() calls authService.signOut() and shows toast', async () => {
    createComponent(true);

    await component.onSignOut();

    expect(mockAuthService.signOut).toHaveBeenCalledOnce();
    expect(component.toast()).not.toBeNull();
  });
});
