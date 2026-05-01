// Feature: vocabulary-memory-app, Property 25: Notification Settings Persistence Round-Trip

import { fc, it } from '@fast-check/vitest';
import { NotificationService } from '../services/notification.service';

/**
 * Validates: Requirements 15.5
 *
 * Property 25: Notification Settings Persistence Round-Trip
 * For any valid notification settings (enabled: boolean, hour: integer 0–23,
 * minute: integer 0–59), saving the settings to localStorage via
 * NotificationService.saveSettings() and then loading them back via
 * NotificationService.loadSettings() SHALL produce identical enabled, hour,
 * and minute values.
 */

// Mock navigator.serviceWorker to avoid errors in jsdom (no service worker support)
Object.defineProperty(globalThis.navigator, 'serviceWorker', {
  value: {
    controller: null,
    ready: Promise.resolve({} as ServiceWorkerRegistration),
  },
  writable: true,
  configurable: true,
});

// Mock Notification API if not present in jsdom
if (!('Notification' in globalThis)) {
  Object.defineProperty(globalThis, 'Notification', {
    value: {
      permission: 'default' as NotificationPermission,
      requestPermission: async () => 'default' as NotificationPermission,
    },
    writable: true,
    configurable: true,
  });
}

describe('NotificationService — Property 25: Notification Settings Persistence Round-Trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it.prop(
    [
      fc.boolean(),
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 }),
    ],
    { numRuns: 100 }
  )(
    'saveSettings then loadSettings produces identical enabled value',
    async (enabled, hour, minute) => {
      const service = new NotificationService();
      await service.saveSettings(enabled, hour, minute);
      service.loadSettings();
      expect(service.isEnabled()).toBe(enabled);
    }
  );

  it.prop(
    [
      fc.boolean(),
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 }),
    ],
    { numRuns: 100 }
  )(
    'saveSettings then loadSettings produces identical hour value',
    async (enabled, hour, minute) => {
      const service = new NotificationService();
      await service.saveSettings(enabled, hour, minute);
      service.loadSettings();
      expect(service.reminderHour()).toBe(hour);
    }
  );

  it.prop(
    [
      fc.boolean(),
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 }),
    ],
    { numRuns: 100 }
  )(
    'saveSettings then loadSettings produces identical minute value',
    async (enabled, hour, minute) => {
      const service = new NotificationService();
      await service.saveSettings(enabled, hour, minute);
      service.loadSettings();
      expect(service.reminderMinute()).toBe(minute);
    }
  );

  it.prop(
    [
      fc.boolean(),
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 }),
    ],
    { numRuns: 100 }
  )(
    'saveSettings then loadSettings produces identical enabled, hour, and minute values simultaneously',
    async (enabled, hour, minute) => {
      const service = new NotificationService();
      await service.saveSettings(enabled, hour, minute);
      service.loadSettings();
      expect(service.isEnabled()).toBe(enabled);
      expect(service.reminderHour()).toBe(hour);
      expect(service.reminderMinute()).toBe(minute);
    }
  );
});

// Feature: vocabulary-memory-app, Property 26: Notification Delivery Condition

/**
 * Validates: Requirements 15.6, 15.7
 *
 * Property 26: Notification Delivery Condition
 * For any collection state with N due entries (N ≥ 0) and any list of
 * ReviewSession records, shouldDeliverNotification(sessions, today) SHALL
 * return true if and only if no session in the list has a date equal to
 * today's date. When it returns true, buildNotificationPayload(N) SHALL
 * produce a payload with title "ถึงเวลาทบทวนคำศัพท์แล้ว!" and a body
 * string containing the number N.
 */
describe('NotificationService — Property 26: Notification Delivery Condition', () => {
  const sessionArb = fc.record({
    id: fc.uuid(),
    date: fc.string(),
    reviewedCount: fc.nat(),
    completedAt: fc.string(),
  });

  it.prop(
    [fc.array(sessionArb), fc.string(), fc.nat()],
    { numRuns: 100 }
  )(
    'shouldDeliverNotification returns true iff no session has date === today',
    (sessions, today, _dueCount) => {
      const service = new NotificationService();
      const result = service.shouldDeliverNotification(sessions, today);
      const hasSessionToday = sessions.some((s) => s.date === today);
      expect(result).toBe(!hasSessionToday);
    }
  );

  it.prop(
    [fc.array(sessionArb), fc.string(), fc.nat()],
    { numRuns: 100 }
  )(
    'when shouldDeliverNotification returns true, buildNotificationPayload has correct title and body containing N',
    (sessions, today, dueCount) => {
      const service = new NotificationService();
      const shouldDeliver = service.shouldDeliverNotification(sessions, today);
      if (shouldDeliver) {
        const payload = service.buildNotificationPayload(dueCount);
        expect(payload.title).toBe('ถึงเวลาทบทวนคำศัพท์แล้ว!');
        expect(payload.body).toContain(String(dueCount));
      }
    }
  );
});

// Feature: vocabulary-memory-app, Property 27: Install Prompt Suppression Window

/**
 * Validates: Requirements 16.4
 *
 * Property 27: Install Prompt Suppression Window
 * For any dismissal timestamp T and any check timestamp T', the
 * shouldShowInstallPrompt(T, T') function SHALL return false when
 * T' − T < 7 days (604,800,000 ms), and SHALL return true when
 * T' − T ≥ 7 days. When dismissedAt is null, the function SHALL
 * always return true.
 */
describe('NotificationService — Property 27: Install Prompt Suppression Window', () => {
  it.prop(
    [fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })],
    { numRuns: 100 }
  )(
    'when dismissedAt is null, shouldShowInstallPrompt always returns true',
    (now) => {
      const service = new NotificationService();
      expect(service.shouldShowInstallPrompt(null, now)).toBe(true);
    }
  );

  it.prop(
    [
      fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER - 604_800_000 }),
      fc.integer({ min: 0, max: 604_799_999 }),
    ],
    { numRuns: 100 }
  )(
    'when now - dismissedAt < 604_800_000, shouldShowInstallPrompt returns false',
    (dismissedAt, offset) => {
      const now = dismissedAt + offset;
      const service = new NotificationService();
      expect(service.shouldShowInstallPrompt(dismissedAt, now)).toBe(false);
    }
  );

  it.prop(
    [
      fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER - 604_800_000 }),
      fc.integer({ min: 604_800_000, max: Number.MAX_SAFE_INTEGER - 1 }),
    ],
    { numRuns: 100 }
  )(
    'when now - dismissedAt >= 604_800_000, shouldShowInstallPrompt returns true',
    (dismissedAt, offset) => {
      const now = dismissedAt + offset;
      const service = new NotificationService();
      expect(service.shouldShowInstallPrompt(dismissedAt, now)).toBe(true);
    }
  );
});
