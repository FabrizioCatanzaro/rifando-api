ALTER TABLE raffles
  ADD COLUMN IF NOT EXISTS confirmation_method VARCHAR(10) NOT NULL DEFAULT 'whatsapp';

ALTER TABLE number_reservations
  ADD COLUMN IF NOT EXISTS comprobante_url TEXT;
