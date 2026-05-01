/**
 * sw-notifications.js — Custom Service Worker extension for notification scheduling.
 *
 * This file is registered as a standalone service worker alongside the Angular SW.
 * It handles SCHEDULE_NOTIFICATION and CANCEL_NOTIFICATIONS messages from NotificationService,
 * and delivers daily review reminders via the Web Notifications API.
 *
 * Requirements: 15.6, 15.7, 15.8, 15.10, 15.12
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {ReturnType<typeof setTimeout> | null} */
let pendingTimerId = null;

/** Stored scheduling parameters so we can reschedule for the next day. */
let scheduledHour = null;
let scheduledMinute = null;
let scheduledDueCount = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute milliseconds from now until the next occurrence of hour:minute.
 * If that time has already passed today, returns ms until tomorrow at that time.
 *
 * @param {number} hour   0–23
 * @param {number} minute 0–59
 * @returns {number} milliseconds until next occurrence
 */
function msUntilNextOccurrence(hour, minute) {
  const now = new Date();
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0
  );

  let diff = target.getTime() - now.getTime();
  if (diff <= 0) {
    // Time has already passed today — schedule for tomorrow
    diff += 24 * 60 * 60 * 1000;
  }
  return diff;
}

/**
 * Return today's date as a YYYY-MM-DD string (local time).
 *
 * @returns {string}
 */
function todayDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Open the VocabMemoryDB IndexedDB database and check whether a ReviewSession
 * record exists for today's date.
 *
 * @returns {Promise<boolean>} true if a session for today exists
 */
function hasReviewSessionToday() {
  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open('VocabMemoryDB');

    request.onerror = () => {
      // If we cannot open the DB, assume no session (deliver the notification)
      resolve(false);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Guard: if the reviewSessions store doesn't exist yet, no session today
      if (!db.objectStoreNames.contains('reviewSessions')) {
        db.close();
        resolve(false);
        return;
      }

      try {
        const tx = db.transaction('reviewSessions', 'readonly');
        const store = tx.objectStore('reviewSessions');
        const today = todayDateString();

        // Try to use the 'date' index if it exists, otherwise fall back to getAll
        let queryRequest;
        if (store.indexNames.contains('date')) {
          const index = store.index('date');
          queryRequest = index.getAll(today);
        } else {
          queryRequest = store.getAll();
        }

        queryRequest.onsuccess = (e) => {
          const records = e.target.result || [];
          const found = store.indexNames.contains('date')
            ? records.length > 0
            : records.some((r) => r.date === today);
          db.close();
          resolve(found);
        };

        queryRequest.onerror = () => {
          db.close();
          resolve(false);
        };
      } catch {
        db.close();
        resolve(false);
      }
    };

    request.onupgradeneeded = () => {
      // DB doesn't exist yet — no session today
      resolve(false);
    };
  });
}

// ─── Notification delivery ────────────────────────────────────────────────────

/**
 * Fire the notification if no review session exists today, then schedule the
 * next day's notification at the same time.
 *
 * @param {number} dueCount Number of cards due (used in notification body)
 */
async function fireNotification(dueCount) {
  try {
    const sessionExists = await hasReviewSessionToday();

    if (!sessionExists) {
      // Requirement 15.6 — deliver notification
      await self.registration.showNotification('ถึงเวลาทบทวนคำศัพท์แล้ว!', {
        body: `${dueCount} คำรอการทบทวน`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: '/review' },
        requireInteraction: false,
      });
    }
    // Requirement 15.7 — if session exists, skip delivery (fall through)
  } catch (err) {
    // Swallow errors so the reschedule below always runs
    console.error('[sw-notifications] showNotification error:', err);
  }

  // Requirement 15.10 — schedule next day's notification regardless of delivery
  scheduleNotification(scheduledHour, scheduledMinute, scheduledDueCount);
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

/**
 * Schedule a notification for the next occurrence of hour:minute.
 * Clears any previously pending timer first.
 *
 * @param {number} hour
 * @param {number} minute
 * @param {number} dueCount
 */
function scheduleNotification(hour, minute, dueCount) {
  // Cancel any existing timer
  if (pendingTimerId !== null) {
    clearTimeout(pendingTimerId);
    pendingTimerId = null;
  }

  // Persist parameters for rescheduling after delivery
  scheduledHour = hour;
  scheduledMinute = minute;
  scheduledDueCount = dueCount;

  const delay = msUntilNextOccurrence(hour, minute);

  pendingTimerId = setTimeout(() => {
    pendingTimerId = null;
    fireNotification(dueCount);
  }, delay);
}

/**
 * Cancel all pending notification timers.
 */
function cancelNotifications() {
  if (pendingTimerId !== null) {
    clearTimeout(pendingTimerId);
    pendingTimerId = null;
  }
  scheduledHour = null;
  scheduledMinute = null;
  scheduledDueCount = 0;
}

// ─── Message handler ──────────────────────────────────────────────────────────

/**
 * Listen for messages from the app (NotificationService).
 * Requirement 15.12 — uses Angular Service Worker + Web Notifications API,
 * no third-party push service required.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data.type !== 'string') return;

  switch (data.type) {
    case 'SCHEDULE_NOTIFICATION': {
      const hour = typeof data.hour === 'number' ? data.hour : 20;
      const minute = typeof data.minute === 'number' ? data.minute : 0;
      const dueCount = typeof data.dueCount === 'number' ? data.dueCount : 0;
      scheduleNotification(hour, minute, dueCount);
      break;
    }

    case 'CANCEL_NOTIFICATIONS': {
      cancelNotifications();
      break;
    }

    default:
      // Unknown message type — ignore
      break;
  }
});

// ─── Notification click handler ───────────────────────────────────────────────

/**
 * Handle notification click: close the notification and open/focus the app
 * at the URL stored in notification.data.url.
 * Requirement 15.8
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/review';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open, focus it and navigate
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client) {
              return client.navigate(targetUrl);
            }
            return;
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  // Skip waiting so this SW activates immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all clients so messages are received right away
  event.waitUntil(self.clients.claim());
});
