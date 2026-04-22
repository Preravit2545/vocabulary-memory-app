// Data models for Vocabulary Memory App

export interface VocabularyEntry {
  id: string; // UUID v4
  word: string; // unique, lowercase-trimmed
  translation: string;
  pos?: string; // part of speech
  originalSentence?: string;
  notes?: string;
  exampleSentences: string[];

  // AI Enrichment fields
  synonyms: string[];
  antonyms: string[];
  mnemonic?: string;

  // SRS fields
  interval: number; // days (initial: 1)
  easeFactor: number; // initial: 2.5, min: 1.3, max: 4.0
  nextReviewDate: string; // YYYY-MM-DD
  reviewCount: number;

  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface ReviewSession {
  id: string; // UUID v4
  date: string; // YYYY-MM-DD
  reviewedCount: number;
  completedAt: string; // ISO 8601 timestamp
}

export interface ExportData {
  version: 1;
  exportedAt: string; // ISO 8601
  entries: VocabularyEntry[];
}

export interface SRSResult {
  newInterval: number;
  newEaseFactor: number;
  nextReviewDate: Date;
}

export type Rating = 'forgot' | 'hard' | 'easy';

export interface AIEnrichmentRequest {
  word: string;
  originalSentence: string;
  targetLanguage?: string;
}

export interface AIEnrichmentResult {
  pos: string;
  translation: string;
  synonyms: string[];
  antonyms: string[];
  mnemonic: string;
  exampleSentences: string[];
  partialError?: string;
}

export interface AIGenerateRequest {
  word: string;
  translation: string;
  targetLanguage?: string;
}

export interface AIGenerateResult {
  sentences: string[];
  error?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ProgressStats {
  streak: number;
  totalWords: number;
  dueToday: number;
  mastered: number;
}

export interface SessionStats {
  forgot: number;
  hard: number;
  easy: number;
}

export type FilterStatus = 'all' | 'due-today' | 'hard' | 'mastered';
