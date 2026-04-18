import { Injectable } from '@angular/core';
import { ExportData, ImportResult, VocabularyEntry } from '../models/vocabulary-entry.model';

@Injectable({ providedIn: 'root' })
export class ImportExportService {
  exportToJSON(entries: VocabularyEntry[]): string {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
    };
    return JSON.stringify(data, null, 2);
  }

  importFromJSON(json: string, existing: VocabularyEntry[]): ImportResult {
    let parsed: unknown;

    try {
      parsed = JSON.parse(json);
    } catch {
      return { imported: 0, skipped: 0, errors: ['Invalid JSON format'] };
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      !('entries' in parsed) ||
      !Array.isArray((parsed as ExportData).entries)
    ) {
      return { imported: 0, skipped: 0, errors: ['Invalid file format'] };
    }

    const data = parsed as ExportData;
    const existingWords = new Set(existing.map((e) => e.word.toLowerCase()));

    const requiredFields: (keyof VocabularyEntry)[] = [
      'id',
      'word',
      'translation',
      'interval',
      'easeFactor',
      'nextReviewDate',
    ];

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const newEntries: VocabularyEntry[] = [];

    for (const entry of data.entries) {
      const missing = requiredFields.filter(
        (f) => entry[f] === undefined || entry[f] === null || entry[f] === ''
      );

      if (missing.length > 0) {
        errors.push(`Entry missing required fields: ${missing.join(', ')}`);
        continue;
      }

      if (existingWords.has((entry.word as string).toLowerCase())) {
        skipped++;
        continue;
      }

      existingWords.add((entry.word as string).toLowerCase());
      newEntries.push(entry);
      imported++;
    }

    return { imported, skipped, errors };
  }
}
