import { Component, inject, signal, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { v4 as uuidv4 } from 'uuid';
import { VocabularyStoreService } from '../../services/vocabulary-store.service';
import { SrsEngineService } from '../../services/srs-engine.service';
import { db } from '../../db/vocab-memory-db';
import { VocabularyEntry, Rating, SessionStats } from '../../models/vocabulary-entry.model';
import { shuffleDeck } from '../../utils/shuffle';

@Component({
  encapsulation: ViewEncapsulation.None,
  selector: 'app-review',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Loading state -->
    @if (isLoading()) {
      <div class="flex flex-col items-center justify-center min-h-screen">
        <svg class="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-label="Loading">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <p class="mt-4 text-gray-500">Loading cards...</p>
      </div>
    }

    <!-- Empty state -->
    @if (!isLoading() && deck().length === 0) {
      <div class="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p class="text-2xl font-semibold text-gray-700">No cards due for review today! 🎉</p>
        <p class="mt-2 text-gray-500">Come back tomorrow or add new words.</p>
      </div>
    }

    <!-- Complete state -->
    @if (!isLoading() && isComplete()) {
      <div class="flex flex-col items-center justify-center min-h-screen px-6 text-center space-y-4">
        <h2 class="text-2xl font-bold text-gray-800">Session Complete! 🏆</h2>
        <p class="text-gray-600">You reviewed <span class="font-semibold">{{ deck().length }}</span> card(s) today.</p>
        <div class="flex gap-6 mt-4">
          <div class="flex flex-col items-center">
            <span class="text-3xl">🔴</span>
            <span class="text-xl font-bold text-red-500">{{ sessionStats().forgot }}</span>
            <span class="text-sm text-gray-500">Forgot</span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-3xl">🟡</span>
            <span class="text-xl font-bold text-yellow-500">{{ sessionStats().hard }}</span>
            <span class="text-sm text-gray-500">Hard</span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-3xl">🟢</span>
            <span class="text-xl font-bold text-green-500">{{ sessionStats().easy }}</span>
            <span class="text-sm text-gray-500">Easy</span>
          </div>
        </div>
      </div>
    }

    <!-- Review state -->
    @if (!isLoading() && !isComplete() && deck().length > 0 && currentCard) {
      <div class="flex flex-col min-h-screen px-4 pt-6 pb-24">

        <!-- Progress indicator -->
        <div class="text-center text-sm text-gray-500 mb-4">
          Card {{ currentIndex() + 1 }} of {{ deck().length }}
        </div>

        <!-- Card area (upper half) -->
        <div class="flex-1 flex flex-col items-center justify-center">
          <!-- Word (front) -->
          <div class="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
            <p class="text-4xl font-bold text-gray-900 break-words">{{ currentCard.word }}</p>

            <!-- Revealed content -->
            @if (isRevealed()) {
              <div class="mt-6 space-y-4 text-left">
                <!-- POS + Translation -->
                <div>
                  <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">Translation</span>
                  @if (currentCard.pos) {
                    <button
                      type="button"
                      class="ml-2 text-xs font-medium text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full hover:bg-purple-100 transition-colors"
                      (click)="togglePosInfo()"
                      [attr.aria-expanded]="showPosInfo()"
                    >{{ currentCard.pos }}</button>
                  }
                  <p class="text-xl font-semibold text-blue-700 mt-1">{{ currentCard.translation }}</p>
                  @if (showPosInfo() && currentCard.pos) {
                    <div class="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-100 text-sm text-purple-800">
                      {{ getPosDescription(currentCard.pos) }}
                    </div>
                  }
                </div>

                <!-- Synonyms -->
                @if (currentCard.synonyms && currentCard.synonyms.length > 0) {
                  <div>
                    <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">Synonyms</span>
                    <p class="text-gray-700 mt-1 text-sm">{{ currentCard.synonyms.join(' · ') }}</p>
                  </div>
                }

                <!-- Antonyms -->
                @if (currentCard.antonyms && currentCard.antonyms.length > 0 && currentCard.antonyms[0] !== 'none') {
                  <div>
                    <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">Antonyms</span>
                    <p class="text-gray-700 mt-1 text-sm">{{ currentCard.antonyms.join(' · ') }}</p>
                  </div>
                }

                <!-- Mnemonic -->
                @if (currentCard.mnemonic) {
                  <div>
                    <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">Mnemonic 💡</span>
                    <p class="text-gray-700 mt-1 italic">{{ currentCard.mnemonic }}</p>
                  </div>
                }

                <!-- Original sentence -->
                @if (currentCard.originalSentence) {
                  <div>
                    <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">Original Sentence</span>
                    <p class="text-gray-700 mt-1">"{{ currentCard.originalSentence }}"</p>
                  </div>
                }

                <!-- Example sentences -->
                @if (currentCard.exampleSentences && currentCard.exampleSentences.length > 0) {
                  <div>
                    <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">Examples</span>
                    <ul class="mt-1 space-y-1">
                      @for (sentence of currentCard.exampleSentences; track sentence) {
                        <li class="text-gray-600 text-sm">• {{ sentence }}</li>
                      }
                    </ul>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Lower half: action buttons -->
        <div class="mt-6 space-y-3 max-w-md mx-auto w-full">
          @if (!isRevealed()) {
            <!-- Reveal button -->
            <button
              type="button"
              class="w-full bg-blue-600 text-white rounded-xl font-semibold text-lg min-h-[44px] py-3 hover:bg-blue-700 active:bg-blue-800 transition-colors"
              style="min-height: 44px; min-width: 44px;"
              (click)="reveal()"
            >
              Reveal
            </button>
          } @else {
            <!-- Rating buttons -->
            <div class="flex gap-3">
              <button
                type="button"
                class="flex-1 flex flex-col items-center justify-center bg-red-100 text-red-700 rounded-xl font-semibold min-h-[44px] py-3 hover:bg-red-200 active:bg-red-300 transition-colors"
                style="min-height: 44px; min-width: 44px;"
                (click)="rate('forgot')"
              >
                <span class="text-xl">🔴</span>
                <span class="text-sm mt-1">Forgot</span>
              </button>
              <button
                type="button"
                class="flex-1 flex flex-col items-center justify-center bg-yellow-100 text-yellow-700 rounded-xl font-semibold min-h-[44px] py-3 hover:bg-yellow-200 active:bg-yellow-300 transition-colors"
                style="min-height: 44px; min-width: 44px;"
                (click)="rate('hard')"
              >
                <span class="text-xl">🟡</span>
                <span class="text-sm mt-1">Hard</span>
              </button>
              <button
                type="button"
                class="flex-1 flex flex-col items-center justify-center bg-green-100 text-green-700 rounded-xl font-semibold min-h-[44px] py-3 hover:bg-green-200 active:bg-green-300 transition-colors"
                style="min-height: 44px; min-width: 44px;"
                (click)="rate('easy')"
              >
                <span class="text-xl">🟢</span>
                <span class="text-sm mt-1">Easy</span>
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ReviewComponent implements OnInit {
  private vocabStore = inject(VocabularyStoreService);
  private srsEngine = inject(SrsEngineService);

  deck = signal<VocabularyEntry[]>([]);
  currentIndex = signal(0);
  isRevealed = signal(false);
  showPosInfo = signal(false);
  sessionStats = signal<SessionStats>({ forgot: 0, hard: 0, easy: 0 });
  isLoading = signal(true);
  isComplete = signal(false);

  get currentCard(): VocabularyEntry | null {
    return this.deck()[this.currentIndex()] ?? null;
  }

  ngOnInit(): void {
    this.loadDeck();
  }

  async loadDeck(): Promise<void> {
    const entries = await this.vocabStore.getDueEntries();
    this.deck.set(shuffleDeck(entries));
    this.isLoading.set(false);
  }

  reveal(): void {
    this.isRevealed.set(true);
    this.showPosInfo.set(false);
  }

  togglePosInfo(): void {
    this.showPosInfo.set(!this.showPosInfo());
  }

  getPosDescription(pos: string): string {
    const map: Record<string, string> = {
      noun:        'คำนาม — ใช้เรียกชื่อคน สิ่งของ สถานที่ หรือแนวคิด เช่น "dog", "city", "freedom"',
      verb:        'คำกริยา — แสดงการกระทำหรือสภาวะ เช่น "run", "think", "become"',
      adjective:   'คำคุณศัพท์ — ขยายคำนาม บอกลักษณะหรือคุณสมบัติ เช่น "happy", "large", "red"',
      adverb:      'คำวิเศษณ์ — ขยายกริยา คุณศัพท์ หรือวิเศษณ์อื่น บอกวิธี เวลา หรือระดับ เช่น "quickly", "very"',
      pronoun:     'สรรพนาม — ใช้แทนคำนาม เช่น "he", "they", "it"',
      preposition: 'คำบุพบท — แสดงความสัมพันธ์ระหว่างคำ เช่น "in", "on", "at", "by"',
      conjunction: 'คำสันธาน — เชื่อมประโยคหรือวลี เช่น "and", "but", "because"',
      interjection:'คำอุทาน — แสดงอารมณ์หรือความรู้สึก เช่น "wow!", "ouch!", "hey!"',
      determiner:  'คำกำหนดนาม — ระบุหรือจำกัดคำนาม เช่น "the", "a", "this", "some"',
      phrase:      'วลี — กลุ่มคำที่ทำหน้าที่ร่วมกันแต่ไม่ใช่ประโยคสมบูรณ์',
    };
    const key = pos.toLowerCase().trim();
    return map[key] ?? `${pos} — ดูบริบทในประโยคตัวอย่างเพื่อทำความเข้าใจการใช้งาน`;
  }

  async rate(rating: Rating): Promise<void> {
    const card = this.currentCard;
    if (!card) return;

    const result = this.srsEngine.applyRating(card, rating);

    const nextReviewDate = result.nextReviewDate.toISOString().split('T')[0];

    await this.vocabStore.updateEntry(card.id, {
      interval: result.newInterval,
      easeFactor: result.newEaseFactor,
      nextReviewDate,
      reviewCount: card.reviewCount + 1,
    });

    // Update session stats
    const stats = this.sessionStats();
    this.sessionStats.set({ ...stats, [rating]: stats[rating] + 1 });

    const isLast = this.currentIndex() === this.deck().length - 1;

    if (isLast) {
      // Save review session
      const today = new Date().toISOString().split('T')[0];
      await db.reviewSessions.add({
        id: uuidv4(),
        date: today,
        reviewedCount: this.deck().length,
        completedAt: new Date().toISOString(),
      });
      this.isComplete.set(true);
    } else {
      this.currentIndex.set(this.currentIndex() + 1);
      this.isRevealed.set(false);
      this.showPosInfo.set(false);
    }
  }
}
