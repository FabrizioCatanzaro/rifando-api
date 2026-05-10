CREATE TABLE IF NOT EXISTS number_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(raffle_id, number)
);

CREATE INDEX IF NOT EXISTS idx_reservations_expires ON number_reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_reservations_session ON number_reservations(session_id);
