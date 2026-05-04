import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { liveQuery } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/vocab-memory-db';
import { VocabularyEntry } from '../models/vocabulary-entry.model';
import { SyncService } from './sync.service';

@Injectable({ providedIn: 'root' })
export class VocabularyStoreService {
  readonly entries = toSignal(from(liveQuery(() => db.vocabulary.toArray())), {
    initialValue: [] as VocabularyEntry[],
  });

  private readonly syncService = inject(SyncService);

  async addEntry(
    entry: Omit<VocabularyEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    const existing = await this.findByWord(entry.word);
    if (existing) {
      throw new Error('DUPLICATE_WORD');
    }
    const now = new Date().toISOString();
    const fullEntry: VocabularyEntry = {
      ...entry,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    await db.vocabulary.add(fullEntry);
    await this.syncService.notifyChange('create', fullEntry);
  }

  async updateEntry(id: string, changes: Partial<VocabularyEntry>): Promise<void> {
    await db.vocabulary.update(id, {
      ...changes,
      updatedAt: new Date().toISOString(),
    });
    const updatedEntry = await db.vocabulary.get(id);
    if (updatedEntry) {
      await this.syncService.notifyChange('update', updatedEntry);
    }
  }

  async deleteEntry(id: string): Promise<void> {
    const entry = await db.vocabulary.get(id);
    await db.vocabulary.delete(id);
    if (entry) {
      await this.syncService.notifyChange('delete', entry);
    }
  }

  async getAllEntries(): Promise<VocabularyEntry[]> {
    return db.vocabulary.toArray();
  }

  async getDueEntries(): Promise<VocabularyEntry[]> {
    const today = new Date().toISOString().split('T')[0];
    return db.vocabulary.filter((e) => e.nextReviewDate <= today).toArray();
  }

  async findByWord(word: string): Promise<VocabularyEntry | null> {
    const lower = word.toLowerCase();
    const result = await db.vocabulary.filter((e) => e.word.toLowerCase() === lower).first();
    return result ?? null;
  }

  async findBySynonymOverlap(synonyms: string[]): Promise<VocabularyEntry[]> {
    if (synonyms.length === 0) return [];
    const lowerSynonyms = synonyms.map((s) => s.toLowerCase());
    const all = await db.vocabulary.toArray();
    return all.filter((entry) => {
      const entryWordLower = entry.word.toLowerCase();
      if (lowerSynonyms.includes(entryWordLower)) return true;
      return entry.synonyms.some((s) => lowerSynonyms.includes(s.toLowerCase()));
    });
  }
}
