import { Injectable } from '@angular/core';
import {
  AIEnrichmentRequest,
  AIEnrichmentResult,
  AIGenerateRequest,
  AIGenerateResult,
} from '../models/vocabulary-entry.model';

const DASHSCOPE_ENDPOINT =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = 'qwen-flash';
const TIMEOUT_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class AiService {
  private getApiKey(): string {
    return localStorage.getItem('dashscope_api_key') ?? '';
  }

  private async callDashScope(
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    const response = await fetch(DASHSCOPE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getApiKey()}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  async enrichVocabulary(
    req: AIEnrichmentRequest,
    signal?: AbortSignal,
  ): Promise<AIEnrichmentResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Combine external signal with our timeout signal
    const combinedSignal = signal
      ? this.combineSignals(signal, controller.signal)
      : controller.signal;

const prompt = `Given the word "${req.word}" found in this sentence: "${req.originalSentence}"

Please provide:
1. Translation (to Thai): <translation>
2. Synonyms (2-3 words): <synonym1>, <synonym2>, ...
3. Antonyms (1-2 words, or "none" if not applicable): <antonym1>, ...
4. Mnemonic: Write in Thai language. Include the Thai phonetic pronunciation of the word using Thai script (e.g., "reluctant" → "ริ-ลัค-เทิ่นท์"). Then provide a concrete memory hook — a vivid image, story, or word-association — that connects the word's sound or spelling to its meaning. Maximum 3 sentences total.
5. Example sentences (2 natural sentences using the word): <sentence1> / <sentence2>

Return as JSON: { "translation": "", "synonyms": [], "antonyms": [], "mnemonic": "", "exampleSentences": [] }`;

    try {
      const content = await this.callDashScope(prompt, combinedSignal);
      clearTimeout(timeoutId);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        pos: parsed.pos ?? '',
        translation: parsed.translation ?? '',
        synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : [],
        antonyms: Array.isArray(parsed.antonyms) ? parsed.antonyms : [],
        mnemonic: parsed.mnemonic ?? '',
        exampleSentences: Array.isArray(parsed.exampleSentences)
          ? parsed.exampleSentences
          : [],
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return {
          pos: '',
          translation: '',
          synonyms: [],
          antonyms: [],
          mnemonic: '',
          exampleSentences: [],
          partialError: 'AI service timed out',
        };
      }
      return {
        pos: '',
        translation: '',
        synonyms: [],
        antonyms: [],
        mnemonic: '',
        exampleSentences: [],
        partialError: err.message ?? 'AI service error',
      };
    }
  }

  async regenerateMnemonic(
    word: string,
    translation: string,
  ): Promise<{ mnemonic: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const prompt = `For the English word "${word}" (meaning in Thai: "${translation}"):

Write a mnemonic in Thai language. Include:
1. Thai phonetic pronunciation using Thai script (e.g., "ริ-ลัค-เทิ่นท์")
2. A concrete memory hook — a vivid image, story, or word-association connecting the word's sound or spelling to its meaning.
Maximum 3 sentences total.

Return as JSON: { "mnemonic": "" }`;

    try {
      const content = await this.callDashScope(prompt, controller.signal);
      clearTimeout(timeoutId);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      const parsed = JSON.parse(jsonMatch[0]);
      return { mnemonic: parsed.mnemonic ?? '' };
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  async generateContext(
    req: AIGenerateRequest,
    signal?: AbortSignal,
  ): Promise<AIGenerateResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const combinedSignal = signal
      ? this.combineSignals(signal, controller.signal)
      : controller.signal;

    const prompt = `Generate 2 natural example sentences using the word "${req.word}" (meaning: ${req.translation}). Return only the sentences, one per line, no numbering.`;

    try {
      const content = await this.callDashScope(prompt, combinedSignal);
      clearTimeout(timeoutId);

      const sentences = content
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      return { sentences };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        sentences: [],
        error: err.message ?? 'AI service error',
      };
    }
  }

  private combineSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  }
}
