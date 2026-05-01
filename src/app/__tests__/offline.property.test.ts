// Feature: vocabulary-memory-app, Property 28: Offline Graceful Degradation

import { fc, it } from '@fast-check/vitest';
import { AiService } from '../services/ai.service';

/**
 * Validates: Requirements 16.11
 *
 * Property 28: Offline Graceful Degradation
 * For any app state, when navigator.onLine is false and the user attempts an
 * AI enrichment action, the system SHALL return a result with a non-empty
 * partialError field (not throw an unhandled exception), and the offline
 * indicator SHALL be visible in the UI.
 */

const enrichmentRequestArb = fc.record({
  word: fc.string({ minLength: 1, maxLength: 50 }),
  originalSentence: fc.string({ minLength: 1, maxLength: 200 }),
});

const generateRequestArb = fc.record({
  word: fc.string({ minLength: 1, maxLength: 50 }),
  translation: fc.string({ minLength: 1, maxLength: 100 }),
});

describe('AiService — Property 28: Offline Graceful Degradation', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  it.prop([enrichmentRequestArb], { numRuns: 100 })(
    'enrichVocabulary returns a result with non-empty partialError when offline (does not throw)',
    async (req) => {
      const service = new AiService();
      let result: Awaited<ReturnType<AiService['enrichVocabulary']>> | undefined;
      let threw = false;

      try {
        result = await service.enrichVocabulary(req);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeDefined();
      expect(result!.partialError).toBeDefined();
      expect(result!.partialError!.length).toBeGreaterThan(0);
    }
  );

  it.prop([generateRequestArb], { numRuns: 100 })(
    'generateContext returns a result with non-empty error when offline (does not throw)',
    async (req) => {
      const service = new AiService();
      let result: Awaited<ReturnType<AiService['generateContext']>> | undefined;
      let threw = false;

      try {
        result = await service.generateContext(req);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeDefined();
      expect(result!.error).toBeDefined();
      expect(result!.error!.length).toBeGreaterThan(0);
    }
  );
});
