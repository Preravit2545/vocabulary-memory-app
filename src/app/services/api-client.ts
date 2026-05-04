import { Injectable } from '@angular/core';
import { VocabularyEntry, ReviewSession } from '../models/vocabulary-entry.model';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> ?? {}),
    };

    // In dev, send token via Authorization header (cross-origin cookie doesn't work)
    const devToken = localStorage.getItem('vocab_session_token');
    if (devToken) {
      headers['Authorization'] = `Bearer ${devToken}`;
    }

    const res = await fetch(path, { ...options, credentials: 'include', headers });
    if (!res.ok) {
      throw new ApiError(res.status, `API error ${res.status}: ${path}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  getVocabulary(): Promise<VocabularyEntry[]> {
    return this.request('/api/vocabulary');
  }

  createVocabularyEntry(entry: VocabularyEntry): Promise<VocabularyEntry> {
    return this.request('/api/vocabulary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  }

  updateVocabularyEntry(id: string, entry: Partial<VocabularyEntry>): Promise<VocabularyEntry> {
    return this.request(`/api/vocabulary/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  }

  deleteVocabularyEntry(id: string): Promise<void> {
    return this.request(`/api/vocabulary/${id}`, { method: 'DELETE' });
  }

  getReviewSessions(): Promise<ReviewSession[]> {
    return this.request('/api/review-sessions');
  }

  createReviewSession(session: ReviewSession): Promise<ReviewSession> {
    return this.request('/api/review-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
  }
}
