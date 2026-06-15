ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100),
  ADD COLUMN IF NOT EXISTS telegram_link_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS telegram_link_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_telegram_link_token
  ON users (telegram_link_token);
