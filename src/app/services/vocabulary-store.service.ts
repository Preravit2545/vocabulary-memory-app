import { Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { liveQuery } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/vocab-memory-db';
import { VocabularyEntry } from '../models/vocabulary-entry.model';

@Injectable({ providedIn: 'root' })
export class VocabularyStoreService {
  readonly entries = toSignal(from(liveQuery(() => db.vocabulary.toArray())), {
    initialValue: [] as VocabularyEntry[],
  });

  async addEntry(
    entry: Omit<VocabularyEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    const existing = await this.findByWord(entry.word);
    if (existing) {
      throw new Error('DUPLICATE_WORD');
    }
    const now = new Date().toISOString();
    await db.vocabulary.add({
      ...entry,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateEntry(id: string, changes: Partial<VocabularyEntry>): Promise<void> {
    await db.vocabulary.update(id, {
      ...changes,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteEntry(id: string): Promise<void> {
    await db.vocabulary.delete(id);
  }

  async getAllEntries(): Promise<VocabularyEntry[]> {
    return db.vocabulary.toArray();
  }

  async getDueEntries(): Promise<VocabularyEntry[]> {
    const today = new Date().toISOString().split('T')[0];
    return db.vocabulary.filter((e) => e.nextReviewDate <= today).toArray();
  }

  async findByWord(word: string): Promise<VocabularyEntry | undefined> {
    const lower = word.toLowerCase();
    return db.vocabulary.filter((e) => e.word.toLowerCase() === lower).first();
  }
}
