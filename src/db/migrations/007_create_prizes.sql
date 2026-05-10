CREATE TABLE IF NOT EXISTS prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  description VARCHAR(500),
  image_url VARCHAR(500),
  position INTEGER NOT NULL,
  winner_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prizes_raffle ON prizes(raffle_id, position);
