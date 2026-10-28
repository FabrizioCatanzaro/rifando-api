-- Compras: agrupa los números que un comprador reserva en una sola operación.
-- Guarda el total real (con promoción), el comprobante y el estado de la compra.
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  session_id VARCHAR(100) NOT NULL,
  buyer_name VARCHAR(150) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  promotion_label VARCHAR(100),
  comprobante_url TEXT,
  status VARCHAR(12) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired', 'cancelled')),
  -- NULL = no vence (compra con comprobante: espera la decisión del rifante).
  expires_at TIMESTAMPTZ,
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_raffle_status ON purchases(raffle_id, status);
CREATE INDEX IF NOT EXISTS idx_purchases_expires ON purchases(expires_at) WHERE status = 'pending';

ALTER TABLE number_reservations
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE;
ALTER TABLE number_reservations ALTER COLUMN expires_at DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_purchase ON number_reservations(purchase_id);

ALTER TABLE raffle_numbers
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_amount NUMERIC(12, 2);

-- Backfill: ventas existentes valen el precio unitario.
UPDATE raffle_numbers rn
SET sale_amount = r.price_per_number
FROM raffles r
WHERE rn.raffle_id = r.id AND rn.status = 'sold' AND rn.sale_amount IS NULL;

-- Backfill: una compra por cada grupo (rifa, sesión) de reservas vigentes.
INSERT INTO purchases (raffle_id, session_id, buyer_name, quantity, total, comprobante_url, expires_at)
SELECT nr.raffle_id,
       nr.session_id,
       COALESCE(MAX(nr.buyer_name), 'Sin nombre'),
       COUNT(*),
       COUNT(*) * r.price_per_number,
       MAX(nr.comprobante_url),
       CASE WHEN MAX(nr.comprobante_url) IS NULL THEN MAX(nr.expires_at) ELSE NULL END
FROM number_reservations nr
JOIN raffles r ON r.id = nr.raffle_id
WHERE nr.purchase_id IS NULL
GROUP BY nr.raffle_id, nr.session_id, r.price_per_number;

UPDATE number_reservations nr
SET purchase_id = p.id,
    expires_at = p.expires_at
FROM purchases p
WHERE nr.purchase_id IS NULL
  AND p.raffle_id = nr.raffle_id
  AND p.session_id = nr.session_id;
