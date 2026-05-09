import { Injectable, signal, computed } from '@angular/core';
import { db } from '../db/vocab-memory-db';

export interface UserSession {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  session = signal<UserSession | null>(null);
  isAuthenticated = computed(() => this.session() !== null);
  isGuest = computed(() => this.session() === null);

  async loadSession(): Promise<void> {
    // Check for session_token in URL (dev OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('session_token');
    if (tokenFromUrl) {
      localStorage.setItem('vocab_session_token', tokenFromUrl);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Try cookie-based session first (production)
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data) { this.session.set(data); return; }
      }
    } catch { /* fall through */ }

    // Fall back to localStorage token (dev)
    const storedToken = localStorage.getItem('vocab_session_token');
    if (storedToken) {
      try {
        // Decode JWT payload (no verification needed — server will verify on API calls)
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        this.session.set({
          userId: payload.sub,
          name: payload.name ?? null,
          email: payload.email ?? null,
          image: payload.picture ?? null,
        });
        return;
      } catch { localStorage.removeItem('vocab_session_token'); }
    }

    this.session.set(null);
  }

  signIn(provider: 'google'): void {
    window.location.href = `/api/auth/signin/${provider}`;
  }

  async signOut(): Promise<void> {
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
    } finally {
      localStorage.removeItem('vocab_session_token');
      // Clear all local data so the next user (or re-login) starts fresh
      await db.vocabulary.clear();
      await db.reviewSessions.clear();
      await db.syncQueue.clear();
      this.session.set(null);
    }
  }
}
