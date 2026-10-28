-- Sprint 2: comisiones de la app, meta de ganancia y tiempo de reserva por rifa.

-- 1. Comisión de Rifando (% sobre lo recaudado). Se copia de APP_FEE_PERCENT al crear la rifa.
--    Las rifas anteriores quedan en 0: no se cobra comisión retroactiva.
ALTER TABLE raffles
  ADD COLUMN IF NOT EXISTS app_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE raffles DROP CONSTRAINT IF EXISTS chk_raffles_app_fee_percent;
ALTER TABLE raffles
  ADD CONSTRAINT chk_raffles_app_fee_percent CHECK (app_fee_percent >= 0 AND app_fee_percent < 100);

-- 2. Meta de ganancia neta que cargó el rifante (informativa, para recalcular el precio).
ALTER TABLE raffles
  ADD COLUMN IF NOT EXISTS target_amount NUMERIC(12, 2);

-- 3. Tiempo que quedan ocupados los números de una reserva sin comprobante (rifas sin Mercado Pago).
ALTER TABLE raffles
  ADD COLUMN IF NOT EXISTS reservation_ttl_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE raffles DROP CONSTRAINT IF EXISTS chk_raffles_reservation_ttl;
ALTER TABLE raffles
  ADD CONSTRAINT chk_raffles_reservation_ttl CHECK (reservation_ttl_minutes IN (30, 60, 360, 1440));

-- 4. Comisión de Rifando retenida por Mercado Pago en cada pago (marketplace_fee).
ALTER TABLE mercadopago_payments
  ADD COLUMN IF NOT EXISTS marketplace_fee NUMERIC(12, 2);

-- 5. Pago de la comisión de ventas manuales (transferencia o WhatsApp).
--    El rifante transfiere a Rifando, sube el comprobante y el admin aprueba.
--    amount = base_amount × fee_percent / 100, calculado por la API al enviar.
CREATE TABLE IF NOT EXISTS raffle_fee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  base_amount NUMERIC(12, 2) NOT NULL,
  fee_percent NUMERIC(5, 2) NOT NULL,
  comprobante_url TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fee_payments_raffle ON raffle_fee_payments(raffle_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_status ON raffle_fee_payments(status);
