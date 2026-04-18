import { Component, ViewEncapsulation } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  encapsulation: ViewEncapsulation.None,
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex flex-col h-screen">
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
export class App {}
