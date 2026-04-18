import Dexie, { type Table } from 'dexie';
import { VocabularyEntry, ReviewSession } from '../models/vocabulary-entry.model';

export class VocabMemoryDB extends Dexie {
  vocabulary!: Table<VocabularyEntry>;
  reviewSessions!: Table<ReviewSession>;

  constructor() {
    super('VocabMemoryDB');
    this.version(1).stores({
      vocabulary: 'id, word, nextReviewDate, interval, easeFactor',
      reviewSessions: 'id, date',
    });
  }
}

export const db = new VocabMemoryDB();
