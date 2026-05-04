import Dexie, { type Table } from 'dexie';
import { VocabularyEntry, ReviewSession, PendingChange } from '../models/vocabulary-entry.model';

export class VocabMemoryDB extends Dexie {
  vocabulary!: Table<VocabularyEntry>;
  reviewSessions!: Table<ReviewSession>;
  syncQueue!: Table<PendingChange>;

  constructor() {
    super('VocabMemoryDB');
    this.version(1).stores({
      vocabulary: 'id, word, nextReviewDate, interval, easeFactor',
      reviewSessions: 'id, date',
    });
    this.version(2).stores({
      vocabulary: 'id, word, nextReviewDate, interval, easeFactor',
      reviewSessions: 'id, date',
      syncQueue: 'id, entryId, operation, nextRetryAt',
    });
  }
}

export const db = new VocabMemoryDB();
