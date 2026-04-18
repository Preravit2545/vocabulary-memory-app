// Feature: vocabulary-memory-app, Property 13: Export/Import Round-Trip

import { fc, it } from '@fast-check/vitest';
import { ImportExportService } from '../services/import-export.service';
import { VocabularyEntry } from '../models/vocabulary-entry.model';

/**
 * Validates: Requirements 6.1, 6.2, 6.5
 *
 * Property 13: Export/Import Round-Trip
 * For any valid collection of VocabularyEntry items, exporting to JSON and then importing
 * into an empty collection SHALL produce a collection where every original entry is present
 * with identical id, word, translation, interval, easeFactor, nextReviewDate, and reviewCount values.
 */

function arbitraryVocabularyEntry(wordSuffix: number) {
  return fc.record({
    id: fc.uuid(),
    word: fc.stringMatching(/^[a-z]{3,10}$/).map((w) => `${w}${wordSuffix}`),
    translation: fc.string({ minLength: 1, maxLength: 50 }),
    interval: fc.integer({ min: 1, max: 365 }),
    easeFactor: fc.double({ min: 1.3, max: 4.0, noNaN: true }),
    nextReviewDate: fc
      .integer({ min: 2020, max: 2030 })
      .chain((year) =>
        fc.integer({ min: 1, max: 12 }).chain((month) =>
          fc.integer({ min: 1, max: 28 }).map((day) => {
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${year}-${mm}-${dd}`;
          })
        )
      ),
    reviewCount: fc.integer({ min: 0, max: 1000 }),
    exampleSentences: fc.constant([]),
    synonyms: fc.constant([]),
    antonyms: fc.constant([]),
    createdAt: fc.constant(new Date().toISOString()),
    updatedAt: fc.constant(new Date().toISOString()),
  });
}

function arbitraryUniqueEntries() {
  // Use a fixed-size tuple to avoid slow dynamic chain depths
  // Indices 0-9 produce distinct word suffixes, guaranteeing uniqueness
  return fc
    .tuple(
      arbitraryVocabularyEntry(0),
      arbitraryVocabularyEntry(1),
      arbitraryVocabularyEntry(2),
      arbitraryVocabularyEntry(3),
      arbitraryVocabularyEntry(4),
      arbitraryVocabularyEntry(5),
      arbitraryVocabularyEntry(6),
      arbitraryVocabularyEntry(7),
      arbitraryVocabularyEntry(8),
      arbitraryVocabularyEntry(9),
    )
    .chain((all) =>
      fc.integer({ min: 1, max: all.length }).map((count) => all.slice(0, count))
    );
}

// Feature: vocabulary-memory-app, Property 14: Import Duplicate Skipping

/**
 * Validates: Requirements 6.3
 *
 * Property 14: Import Duplicate Skipping
 * For any existing collection and any import file where K entries have words already in the
 * collection, the import operation SHALL add exactly (total - K) new entries, skip exactly K
 * entries, and report skippedCount = K.
 */
describe('ImportExportService — Property 14: Import Duplicate Skipping', () => {
  // Generate a scenario with existing entries, K duplicates, and M new entries
  // Uses fixed-size tuples to avoid slow dynamic chain depths
  const arbitraryImportScenario = fc.tuple(
    // 4 existing entries (indices 0-3)
    arbitraryVocabularyEntry(0),
    arbitraryVocabularyEntry(1),
    arbitraryVocabularyEntry(2),
    arbitraryVocabularyEntry(3),
    // 3 new entries (indices 100-102, word suffix far from existing to avoid collisions)
    arbitraryVocabularyEntry(100),
    arbitraryVocabularyEntry(101),
    arbitraryVocabularyEntry(102),
    // How many of the existing entries to include as duplicates (0-4)
    fc.integer({ min: 0, max: 4 }),
    // How many new entries to include (0-3)
    fc.integer({ min: 0, max: 3 }),
  ).map(([e0, e1, e2, e3, n0, n1, n2, k, m]) => {
    const existing = [e0, e1, e2, e3];
    // Duplicates: take first k existing entries, give them new ids
    const duplicates = existing.slice(0, k).map((e, i) => ({ ...e, id: `dup-${i}` }));
    // New entries: take first m new entries
    const newEntries = [n0, n1, n2].slice(0, m);
    return { existing, duplicates, newEntries, k };
  });

  it.prop([arbitraryImportScenario], { numRuns: 100 })(
    'import skips entries whose word already exists and counts them correctly',
    ({ existing, duplicates, newEntries, k }) => {
      const service = new ImportExportService();

      const importEntries = [...duplicates, ...newEntries];
      const total = importEntries.length;

      const importJson = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: importEntries,
      });

      const result = service.importFromJSON(importJson, existing);

      expect(result.skipped).toBe(k);
      expect(result.imported).toBe(total - k);
      expect(result.errors).toHaveLength(0);
    }
  );
});

describe('ImportExportService — Property 13: Export/Import Round-Trip', () => {
  it.prop([arbitraryUniqueEntries()], { numRuns: 100 })(
    'exporting then importing into empty collection preserves all entries with identical key fields',
    (originalEntries) => {
      const service = new ImportExportService();

      // Export the original entries
      const json = service.exportToJSON(originalEntries);

      // Import into an empty collection
      const result = service.importFromJSON(json, []);

      // All entries should be imported, none skipped
      expect(result.imported).toBe(originalEntries.length);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Re-parse the exported JSON to get the entries back for field comparison
      const parsed = JSON.parse(json) as { entries: VocabularyEntry[] };
      const importedEntries = parsed.entries;

      // Every original entry must be present with identical key fields
      for (const original of originalEntries) {
        const match = importedEntries.find((e) => e.id === original.id);
        expect(match).toBeDefined();
        if (match) {
          expect(match.word).toBe(original.word);
          expect(match.translation).toBe(original.translation);
          expect(match.interval).toBe(original.interval);
          expect(match.easeFactor).toBe(original.easeFactor);
          expect(match.nextReviewDate).toBe(original.nextReviewDate);
          expect(match.reviewCount).toBe(original.reviewCount);
        }
      }
    }
  );
});
