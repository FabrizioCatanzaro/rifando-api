ALTER TABLE raffles
  ADD COLUMN confirmation_method VARCHAR(10) NOT NULL DEFAULT 'whatsapp';

ALTER TABLE number_reservations
  ADD COLUMN comprobante_url TEXT;
