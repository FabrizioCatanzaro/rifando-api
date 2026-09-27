-- Mercado Pago: cada rifante vincula su cuenta por OAuth y cobra directo en ella.
-- La comisión de Mercado Pago la absorbe el rifante (se cobra el total de la compra).

-- 1. Nuevo método de cobro por rifa. 'mercadopago' no entra en VARCHAR(10).
ALTER TABLE raffles ALTER COLUMN confirmation_method TYPE VARCHAR(20);
ALTER TABLE raffles DROP CONSTRAINT IF EXISTS chk_raffles_confirmation_method;
ALTER TABLE raffles
  ADD CONSTRAINT chk_raffles_confirmation_method
  CHECK (confirmation_method IN ('whatsapp', 'upload', 'mercadopago'));

-- 2. State de OAuth de un solo uso (mismo patrón que la vinculación de Telegram).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mp_oauth_state VARCHAR(64),
  ADD COLUMN IF NOT EXISTS mp_oauth_state_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_mp_oauth_state ON users (mp_oauth_state);

-- 3. Cuenta vinculada. Una por rifante. Tokens cifrados con AES-256-GCM.
CREATE TABLE IF NOT EXISTS mercadopago_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mp_user_id BIGINT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  public_key VARCHAR(100),
  live_mode BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Preferencia de pago de la compra (se reutiliza si el comprador reintenta).
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS mp_preference_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS mp_init_point TEXT;

-- 5. Historial de pagos recibidos. Idempotente por mp_payment_id.
-- status guarda el estado de Mercado Pago tal cual (approved, rejected, refunded...).
-- No lleva CHECK: si Mercado Pago agrega un estado, el webhook no debe fallar.
-- outcome: qué hizo Rifando con el pago.
--   confirmed       → confirmó la compra
--   late            → la compra ya no estaba pendiente (vencida o cancelada)
--   amount_mismatch → el monto pagado no cubre el total
--   duplicate       → la compra ya estaba confirmada (pago doble)
-- mp_updated_at: date_last_updated de Mercado Pago. Descarta notificaciones viejas.
CREATE TABLE IF NOT EXISTS mercadopago_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id BIGINT NOT NULL UNIQUE,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  status_detail VARCHAR(100),
  amount NUMERIC(12, 2) NOT NULL,
  fee_amount NUMERIC(12, 2),
  net_amount NUMERIC(12, 2),
  payment_method_id VARCHAR(50),
  payer_email VARCHAR(255),
  live_mode BOOLEAN NOT NULL DEFAULT TRUE,
  outcome VARCHAR(20)
    CHECK (outcome IS NULL OR outcome IN ('confirmed', 'late', 'amount_mismatch', 'duplicate')),
  date_approved TIMESTAMPTZ,
  mp_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_payments_purchase ON mercadopago_payments(purchase_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_user_created ON mercadopago_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_payments_raffle ON mercadopago_payments(raffle_id);
