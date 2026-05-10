CREATE TABLE IF NOT EXISTS raffle_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold')),
  buyer_name VARCHAR(150),
  buyer_phone VARCHAR(30),
  sold_at TIMESTAMPTZ,
  UNIQUE(raffle_id, number)
);

CREATE INDEX IF NOT EXISTS idx_raffle_numbers_raffle_status ON raffle_numbers(raffle_id, status);
