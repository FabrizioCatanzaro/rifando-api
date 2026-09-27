-- Cambio de nombre de usuario.
-- username_changed_at: limita los cambios (uno cada 30 días).
-- username_history: los nombres viejos redirigen al usuario actual y nadie más puede tomarlos,
-- así los links y QR de rifas ya compartidos siguen funcionando.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS username_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(50) NOT NULL UNIQUE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_username_history_user ON username_history(user_id);
