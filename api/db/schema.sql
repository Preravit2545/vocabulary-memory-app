-- Users table (populated by Google OAuth callback)
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  email       TEXT UNIQUE,
  image       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Vocabulary entries per user
CREATE TABLE IF NOT EXISTS vocabulary_entries (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word              TEXT NOT NULL,
  translation       TEXT NOT NULL,
  original_sentence TEXT,
  notes             TEXT,
  example_sentences JSONB NOT NULL DEFAULT '[]',
  synonyms          JSONB NOT NULL DEFAULT '[]',
  antonyms          JSONB NOT NULL DEFAULT '[]',
  mnemonic          TEXT,
  interval          INTEGER NOT NULL DEFAULT 1,
  ease_factor       NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  next_review_date  DATE NOT NULL,
  review_count      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vocab_user_id ON vocabulary_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_vocab_next_review ON vocabulary_entries(user_id, next_review_date);

-- Review sessions per user
CREATE TABLE IF NOT EXISTS review_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  reviewed_count  INTEGER NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON review_sessions(user_id, date);
