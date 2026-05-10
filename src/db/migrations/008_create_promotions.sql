CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  type VARCHAR(15) NOT NULL CHECK (type IN ('pack', 'percentage', 'bundle')),
  label VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 1),
  price NUMERIC(12, 2),
  discount_percentage INTEGER CHECK (discount_percentage BETWEEN 1 AND 99),
  free_numbers INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_raffle ON promotions(raffle_id, active);
