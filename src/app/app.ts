import { Component, OnInit, ViewEncapsulation, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { NotificationService } from './services/notification.service';
import { AuthService } from './services/auth.service';
import { SyncService } from './services/sync.service';

/** Minimal typing for the non-standard BeforeInstallPromptEvent. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INSTALL_PROMPT_DISMISSED_KEY = 'install_prompt_dismissed_at';

@Component({
  encapsulation: ViewEncapsulation.None,
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex flex-col h-screen">
      <!-- PWA install banner (Req 16.3, 16.4) -->
      @if (showInstallBanner()) {
        <div class="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-2 z-50">
          <span class="text-sm font-medium">เพิ่มแอปไปยังหน้าจอหลัก</span>
          <div class="flex gap-2 shrink-0">
            <button
              (click)="onInstall()"
              class="min-h-[44px] min-w-[44px] px-4 py-2 bg-white text-blue-600 text-sm font-semibold rounded-md hover:bg-blue-50 transition-colors"
            >
              ติดตั้ง
            </button>
            <button
              (click)="onDismissInstall()"
              class="min-h-[44px] min-w-[44px] px-4 py-2 bg-blue-700 text-white text-sm rounded-md hover:bg-blue-800 transition-colors"
            >
              ไม่ใช่ตอนนี้
            </button>
          </div>
        </div>
      }

      <!-- PWA update banner (Req 16.6) -->
      @if (showUpdateBanner()) {
        <div class="bg-green-600 text-white px-4 py-3 flex items-center justify-between gap-2 z-50">
          <span class="text-sm font-medium">มีเวอร์ชันใหม่พร้อมใช้งาน</span>
          <button
            (click)="onReload()"
            class="min-h-[44px] min-w-[44px] px-4 py-2 bg-white text-green-600 text-sm font-semibold rounded-md hover:bg-green-50 transition-colors shrink-0"
          >
            โหลดใหม่
          </button>
        </div>
      }

      <!-- Offline indicator banner (Req 16.11) -->
      @if (isOffline()) {
        <div class="bg-amber-400 text-amber-900 px-4 py-2 text-center text-sm font-medium z-40" role="status" aria-live="polite">
          ไม่มีการเชื่อมต่ออินเทอร์เน็ต — ฟีเจอร์ AI ไม่พร้อมใช้งาน
        </div>
      }

      <!-- Guest Mode banner (Req 17) -->
      @if (isGuest() && showGuestBanner()) {
        <div class="bg-indigo-50 border-b border-indigo-200 px-4 py-2 flex items-center justify-between gap-2">
          <p class="text-sm text-indigo-700">เข้าสู่ระบบเพื่อ sync คำศัพท์ข้ามอุปกรณ์</p>
          <div class="flex gap-2 shrink-0">
            <a routerLink="/settings" class="text-sm font-medium text-indigo-600 underline min-h-[44px] flex items-center">เข้าสู่ระบบ</a>
            <button (click)="showGuestBanner.set(false)" class="text-indigo-400 hover:text-indigo-600 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg">✕</button>
          </div>
        </div>
      }

      <!-- Sync status indicator (Req 17) -->
      @if (!isGuest()) {
        @if (syncStatus() === 'syncing') {
          <div class="bg-blue-50 px-4 py-1 text-center text-xs text-blue-600">Syncing…</div>
        } @else if (pendingCount() > 0) {
          <div class="bg-amber-50 px-4 py-1 text-center text-xs text-amber-700">Offline — changes saved locally</div>
        }
      }

      <!-- Main content area -->
      <main class="flex-1 overflow-y-auto pb-16">
        <router-outlet />
      </main>

      <!-- Bottom navigation bar -->
      <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center z-50">
        <a
          routerLink="/review"
          routerLinkActive="text-blue-600"
          class="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 text-gray-500 hover:text-blue-600 transition-colors"
        >
          <span class="text-xl">📚</span>
          <span class="text-xs mt-0.5">Review</span>
        </a>

        <a
          routerLink="/add"
          routerLinkActive="text-blue-600"
          class="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 text-gray-500 hover:text-blue-600 transition-colors"
        >
          <span class="text-xl">➕</span>
          <span class="text-xs mt-0.5">Add</span>
        </a>

        <a
          routerLink="/dashboard"
          routerLinkActive="text-blue-600"
          class="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 text-gray-500 hover:text-blue-600 transition-colors"
        >
          <span class="text-xl">📋</span>
          <span class="text-xs mt-0.5">Dashboard</span>
        </a>

        <a
          routerLink="/progress"
          routerLinkActive="text-blue-600"
          class="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 text-gray-500 hover:text-blue-600 transition-colors"
        >
          <span class="text-xl">📊</span>
          <span class="text-xs mt-0.5">Progress</span>
        </a>

        <a
          routerLink="/settings"
          routerLinkActive="text-blue-600"
          class="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 text-gray-500 hover:text-blue-600 transition-colors"
        >
          <span class="text-xl">⚙️</span>
          <span class="text-xs mt-0.5">Settings</span>
        </a>
      </nav>
    </div>
  `,
})
export class App implements OnInit {
  // PWA install prompt (Req 16.3, 16.4)
  showInstallBanner = signal(false);
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  // PWA update banner (Req 16.6)
  showUpdateBanner = signal(false);
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  // Offline indicator (Req 16.11)
  isOffline = signal(!navigator.onLine);

  private readonly notificationService = inject(NotificationService);
  private readonly authService = inject(AuthService);
  private readonly syncService = inject(SyncService);

  // Auth / Guest mode signals (Req 17)
  isGuest = this.authService.isGuest;
  showGuestBanner = signal(true);

  // Sync status signals (Req 17)
  syncStatus = this.syncService.syncStatus;
  pendingCount = this.syncService.pendingCount;

  ngOnInit(): void {
    // Load auth session on startup (no automatic sync — sync is triggered manually after rating)
    this.authService.loadSession();

    // Track online/offline status only — no automatic sync on reconnect
    window.addEventListener('online', () => this.isOffline.set(false));
    window.addEventListener('offline', () => this.isOffline.set(true));

    window.addEventListener('beforeinstallprompt', (event: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;

      // Check if the user previously dismissed the banner
      const raw = localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY);
      const dismissedAt = raw !== null ? Number(raw) : null;

      if (this.notificationService.shouldShowInstallPrompt(dismissedAt, Date.now())) {
        this.showInstallBanner.set(true);
      }
    });

    // Subscribe to service worker version updates
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(() => {
          this.showUpdateBanner.set(true);
        });
    }
  }

  /** User tapped "ติดตั้ง" — trigger the native install prompt. */
  async onInstall(): Promise<void> {
    if (!this.deferredPrompt) return;
    await this.deferredPrompt.prompt();
    this.deferredPrompt = null;
    this.showInstallBanner.set(false);
  }

  /** User tapped "ไม่ใช่ตอนนี้" — record dismissal time and hide banner. */
  onDismissInstall(): void {
    localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, String(Date.now()));
    this.showInstallBanner.set(false);
  }

  /** User tapped "โหลดใหม่" — activate the new SW version and reload. */
  async onReload(): Promise<void> {
    await this.swUpdate?.activateUpdate();
    window.location.reload();
  }
}
