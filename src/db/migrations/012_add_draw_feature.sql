ALTER TABLE raffles ADD COLUMN IF NOT EXISTS draw_unlocked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS raffle_draw_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  comprobante_url TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT chk_draw_payment_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_draw_payments_raffle ON raffle_draw_payments(raffle_id);
CREATE INDEX IF NOT EXISTS idx_draw_payments_status ON raffle_draw_payments(status);
