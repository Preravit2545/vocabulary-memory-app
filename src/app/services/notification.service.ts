import { Injectable, signal } from '@angular/core';
import { ReviewSession } from '../models/vocabulary-entry.model';

// Interfaces for notification settings and messaging
interface NotificationSettings {
  enabled: boolean;
  hour: number; // 0–23
  minute: number; // 0–59
}

interface NotificationPayload {
  title: string; // "ถึงเวลาทบทวนคำศัพท์แล้ว!"
  body: string; // "N คำรอการทบทวน"
  data: { url: '/review' };
}

interface ScheduleNotificationMessage {
  type: 'SCHEDULE_NOTIFICATION';
  hour: number;
  minute: number;
  dueCount: number;
}

interface CancelNotificationMessage {
  type: 'CANCEL_NOTIFICATIONS';
}

const NOTIFICATION_SETTINGS_KEY = 'notification_settings';
const INSTALL_PROMPT_DISMISSED_KEY = 'install_prompt_dismissed_at';

/** URL of the standalone notification service worker. */
const SW_NOTIFICATIONS_URL = '/sw-notifications.js';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  /** Cached registration for the sw-notifications.js service worker. */
  private swNotifRegistration: ServiceWorkerRegistration | null = null;
  // Signals for reactive state
  isEnabled = signal(false);
  reminderHour = signal(20); // default 20:00
  reminderMinute = signal(0);
  permissionState = signal<NotificationPermission>('default');

  /**
   * Request browser notification permission.
   * Updates permissionState signal with the result.
   * Requirement 15.2
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }
    const result = await Notification.requestPermission();
    this.permissionState.set(result);
    return result;
  }

  /**
   * Load persisted notification settings from localStorage.
   * Sets isEnabled, reminderHour, reminderMinute, and permissionState signals.
   * Requirement 15.5
   */
  loadSettings(): void {
    try {
      const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (raw) {
        const settings: NotificationSettings = JSON.parse(raw);
        this.isEnabled.set(settings.enabled ?? false);
        this.reminderHour.set(settings.hour ?? 20);
        this.reminderMinute.set(settings.minute ?? 0);
      }
    } catch {
      // Ignore parse errors — use defaults
    }

    // Sync current browser permission state
    if ('Notification' in window) {
      this.permissionState.set(Notification.permission);
    }
  }

  /**
   * Persist notification settings to localStorage and post a scheduling message
   * to the sw-notifications.js service worker (registered separately from the
   * Angular SW so it can handle setTimeout-based scheduling).
   * Requirement 15.4, 15.5, 15.12
   */
  async saveSettings(enabled: boolean, hour: number, minute: number): Promise<void> {
    const settings: NotificationSettings = { enabled, hour, minute };
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));

    // Update signals to reflect saved state
    this.isEnabled.set(enabled);
    this.reminderHour.set(hour);
    this.reminderMinute.set(minute);

    if (enabled) {
      const message: ScheduleNotificationMessage = {
        type: 'SCHEDULE_NOTIFICATION',
        hour,
        minute,
        dueCount: 0, // dueCount will be resolved by the service worker from IndexedDB
      };
      await this.postToNotifSW(message);
    } else {
      await this.cancelScheduledNotifications();
    }
  }

  /**
   * Cancel all pending scheduled notifications by posting a CANCEL_NOTIFICATIONS
   * message to the sw-notifications.js service worker.
   * Requirement 15.9
   */
  async cancelScheduledNotifications(): Promise<void> {
    const message: CancelNotificationMessage = {
      type: 'CANCEL_NOTIFICATIONS',
    };
    await this.postToNotifSW(message);
  }

  /**
   * Register (or reuse) the sw-notifications.js service worker and post a
   * message to its active worker.  Falls back to the Angular SW controller
   * if the separate registration is unavailable.
   */
  private async postToNotifSW(
    message: ScheduleNotificationMessage | CancelNotificationMessage
  ): Promise<void> {
    if (!('serviceWorker' in navigator)) return;

    try {
      // Register sw-notifications.js in its own scope if not already done
      if (!this.swNotifRegistration) {
        this.swNotifRegistration = await navigator.serviceWorker.register(
          SW_NOTIFICATIONS_URL,
          { scope: '/' }
        );
      }

      // Wait for the SW to become active
      const reg = this.swNotifRegistration;
      const worker = reg.active ?? reg.installing ?? reg.waiting;
      if (worker) {
        worker.postMessage(message);
      }
    } catch {
      // Fallback: post to the Angular SW controller (handles the message if it
      // understands it, otherwise ignores it gracefully)
      navigator.serviceWorker.controller?.postMessage(message);
    }
  }

  /**
   * Pure function: determine if a notification should be delivered.
   * Returns true iff no ReviewSession with today's date exists in sessions.
   * Requirement 15.6, 15.7
   */
  shouldDeliverNotification(sessions: ReviewSession[], today: string): boolean {
    return !sessions.some((session) => session.date === today);
  }

  /**
   * Pure function: build the notification payload for the given due count.
   * Requirement 15.6
   */
  buildNotificationPayload(dueCount: number): NotificationPayload {
    return {
      title: 'ถึงเวลาทบทวนคำศัพท์แล้ว!',
      body: `${dueCount} คำรอการทบทวน`,
      data: { url: '/review' },
    };
  }

  /**
   * Pure function: determine if the install prompt banner should be shown.
   * Returns false if dismissedAt is within 7 days of now.
   * Requirement 16.4
   */
  shouldShowInstallPrompt(dismissedAt: number | null, now: number): boolean {
    if (dismissedAt === null) return true;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    return now - dismissedAt >= SEVEN_DAYS_MS;
  }
}
