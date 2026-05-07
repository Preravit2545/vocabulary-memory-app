import { Injectable, signal, inject } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/vocab-memory-db';
import { VocabularyEntry, PendingChange, ReviewSession } from '../models/vocabulary-entry.model';
import { ApiClient } from './api-client';
import { AuthService } from './auth.service';

export type SyncStatus = 'synced' | 'syncing' | 'offline-with-queue';

@Injectable({ providedIn: 'root' })
export class SyncService {
  syncStatus = signal<SyncStatus>('synced');
  pendingCount = signal(0);

  private readonly apiClient = inject(ApiClient);
  private readonly authService = inject(AuthService);

  constructor() {
    window.addEventListener('online', () => {
      if (this.authService.isAuthenticated()) {
        this.processSyncQueue();
      }
    });
  }

  async notifyChange(op: 'create' | 'update' | 'delete', entry: VocabularyEntry): Promise<void> {
    if (this.authService.isGuest()) return;

    if (navigator.onLine) {
      this.syncStatus.set('syncing');
      try {
        if (op === 'create') await this.apiClient.createVocabularyEntry(entry);
        else if (op === 'update') await this.apiClient.updateVocabularyEntry(entry.id, entry);
        else if (op === 'delete') await this.apiClient.deleteVocabularyEntry(entry.id);
        this.syncStatus.set('synced');
      } catch (err) {
        await this.enqueue(op, entry);
      }
    } else {
      await this.enqueue(op, entry);
    }
  }

  async syncReviewSession(session: ReviewSession): Promise<void> {
    if (this.authService.isGuest()) return;
    if (!navigator.onLine) {
      await this.enqueueSession(session);
      return;
    }
    try {
      await this.apiClient.createReviewSession(session);
    } catch {
      await this.enqueueSession(session);
    }
  }

  async processSyncQueue(): Promise<void> {
    if (this.authService.isGuest()) return;
    const pending = await db.syncQueue.orderBy('createdAt').toArray();
    if (pending.length === 0) {
      this.syncStatus.set('synced');
      this.pendingCount.set(0);
      return;
    }

    this.syncStatus.set('syncing');
    for (const change of pending) {
      if (change.retryCount >= 3) continue;
      try {
        if (change.operation === 'create' && change.payload) {
          await this.apiClient.createVocabularyEntry(change.payload);
        } else if (change.operation === 'update' && change.payload) {
          await this.apiClient.updateVocabularyEntry(change.entryId, change.payload);
        } else if (change.operation === 'delete') {
          await this.apiClient.deleteVocabularyEntry(change.entryId);
        } else if (change.operation === 'create-session' && change.sessionPayload) {
          await this.apiClient.createReviewSession(change.sessionPayload);
        }
        await db.syncQueue.delete(change.id);
      } catch (err) {
        const delay = Math.pow(5, change.retryCount + 1) * 1000;
        await db.syncQueue.update(change.id, {
          retryCount: change.retryCount + 1,
          nextRetryAt: new Date(Date.now() + delay).toISOString(),
        });
      }
    }

    const remaining = await db.syncQueue.count();
    this.pendingCount.set(remaining);
    this.syncStatus.set(remaining > 0 ? 'offline-with-queue' : 'synced');
  }

  resolveConflict(local: VocabularyEntry, cloud: VocabularyEntry): VocabularyEntry {
    if (local.updatedAt > cloud.updatedAt) return local;
    if (cloud.updatedAt > local.updatedAt) return cloud;
    // Tie: preserve higher interval and easeFactor
    return {
      ...cloud,
      interval: Math.max(local.interval, cloud.interval),
      easeFactor: Math.max(local.easeFactor, cloud.easeFactor),
    };
  }

  async initialSync(): Promise<void> {
    if (this.authService.isGuest()) return;
    this.syncStatus.set('syncing');
    try {
      const [cloudEntries, cloudSessions] = await Promise.all([
        this.apiClient.getVocabulary(),
        this.apiClient.getReviewSessions(),
      ]);

      // Merge vocabulary entries
      let conflictsResolved = 0;
      for (const cloudEntry of cloudEntries) {
        const local = await db.vocabulary.get(cloudEntry.id);
        if (!local) {
          await db.vocabulary.put(cloudEntry);
        } else {
          const winner = this.resolveConflict(local, cloudEntry);
          if (winner !== local) {
            await db.vocabulary.put(winner);
            conflictsResolved++;
          }
        }
      }

      // Merge review sessions (no conflict resolution needed — just add missing)
      for (const cloudSession of cloudSessions) {
        const local = await db.reviewSessions.get(cloudSession.id);
        if (!local) {
          await db.reviewSessions.put(cloudSession);
        }
      }

      // Push local-only sessions to cloud (bidirectional sync)
      const cloudSessionIds = new Set(cloudSessions.map(s => s.id));
      const localSessions = await db.reviewSessions.toArray();
      for (const localSession of localSessions) {
        if (!cloudSessionIds.has(localSession.id)) {
          try {
            await this.apiClient.createReviewSession(localSession);
          } catch {
            // Queue for retry if push fails
            await this.enqueueSession(localSession);
          }
        }
      }

      if (conflictsResolved > 0) {
        // Toast will be shown by the component observing syncStatus
        console.log(`Resolved ${conflictsResolved} conflicts during sync`);
      }

      this.syncStatus.set('synced');
    } catch (err) {
      console.error('Initial sync failed:', err);
      this.syncStatus.set('offline-with-queue');
    }
  }

  private async enqueue(op: 'create' | 'update' | 'delete', entry: VocabularyEntry): Promise<void> {
    const now = new Date().toISOString();
    const change: PendingChange = {
      id: uuidv4(),
      operation: op,
      entryId: entry.id,
      payload: op === 'delete' ? null : entry,
      createdAt: now,
      retryCount: 0,
      nextRetryAt: new Date(Date.now() + 5000).toISOString(),
    };
    await db.syncQueue.add(change);
    const count = await db.syncQueue.count();
    this.pendingCount.set(count);
    this.syncStatus.set('offline-with-queue');
  }

  private async enqueueSession(session: ReviewSession): Promise<void> {
    const now = new Date().toISOString();
    const change: PendingChange = {
      id: uuidv4(),
      operation: 'create-session',
      entryId: session.id, // reuse entryId field as sessionId for queue lookup
      payload: null,
      sessionPayload: session,
      createdAt: now,
      retryCount: 0,
      nextRetryAt: new Date(Date.now() + 5000).toISOString(),
    };
    await db.syncQueue.add(change);
    const count = await db.syncQueue.count();
    this.pendingCount.set(count);
    this.syncStatus.set('offline-with-queue');
  }
}
