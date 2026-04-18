import { Injectable } from '@angular/core';
import { VocabularyEntry, Rating, SRSResult } from '../models/vocabulary-entry.model';

@Injectable({ providedIn: 'root' })
export class SrsEngineService {
  applyRating(entry: VocabularyEntry, rating: Rating): SRSResult {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newInterval: number;
    let newEaseFactor: number;
    let nextReviewDate: Date;

    switch (rating) {
      case 'forgot':
        newInterval = 1;
        newEaseFactor = Math.max(entry.easeFactor - 0.2, 1.3);
        nextReviewDate = new Date(today);
        break;

      case 'hard':
        newInterval = Math.max(Math.floor(entry.interval * 1.2), 1);
        newEaseFactor = entry.easeFactor;
        nextReviewDate = new Date(today);
        nextReviewDate.setDate(today.getDate() + newInterval);
        break;

      case 'easy':
        newInterval = Math.floor(entry.interval * entry.easeFactor);
        newEaseFactor = Math.min(entry.easeFactor + 0.1, 4.0);
        nextReviewDate = new Date(today);
        nextReviewDate.setDate(today.getDate() + newInterval);
        break;
    }

    return { newInterval, newEaseFactor, nextReviewDate };
  }
}
