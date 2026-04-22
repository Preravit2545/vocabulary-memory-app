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

const prompt = `Act as an expert English-Thai linguist. Given the word "${req.word}" found in the context of this sentence: "${req.originalSentence}"

Please provide the following details:

1. Part of Speech ("pos"): The part of speech of the word based on the context (e.g., noun, verb, adjective).
2. Translation ("translation"): Thai translation only. Provide up to 3 meanings maximum, separated by commas. Keep it short and concise. (No English, no parentheses).
3. Synonyms ("synonyms"): 2-3 words. Format each strictly as "ENGLISH_WORD (คำแปลภาษาไทย)".
4. Antonyms ("antonyms"): 1-2 words. Format each strictly as "ENGLISH_WORD (คำแปลภาษาไทย)", or use ["none"] if not applicable.
5. Mnemonic ("mnemonic"): A short, creative, and easy-to-understand memory trick in Thai. It MUST start with the Thai pronunciation in brackets. (Example: "[เพอ-เวิร์ท] - นึกถึงคนแปลกประหลาดที่ชอบทำตัวเพี้ยนๆ...")
6. Example Sentences ("exampleSentences"): 2 natural, everyday ENGLISH sentences using the word. Each sentence MUST be followed immediately by its Thai translation in parentheses. Example format: "English sentence. (คำแปลภาษาไทย)"

Return ONLY valid JSON matching exactly this structure without any markdown blocks or extra text:
{
  "pos": "",
  "translation": "",
  "synonyms": [],
  "antonyms": [],
  "mnemonic": "",
  "exampleSentences": []
}`;

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
