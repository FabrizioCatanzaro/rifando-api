CREATE TABLE IF NOT EXISTS raffles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug VARCHAR(150) NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  total_numbers INTEGER NOT NULL CHECK (total_numbers > 10),
  price_per_number NUMERIC(12, 2) NOT NULL CHECK (price_per_number >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'finished')),
  visibility VARCHAR(10) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  access_code CHAR(6),
  cover_icon VARCHAR(10) NOT NULL DEFAULT '🔒',
  draw_mode VARCHAR(20) NOT NULL DEFAULT 'all_sold' CHECK (draw_mode IN ('all_sold', 'fixed_date', 'first_event')),
  draw_date TIMESTAMPTZ,
  prize_assignment_mode VARCHAR(20) NOT NULL DEFAULT 'automatic' CHECK (prize_assignment_mode IN ('automatic', 'sequential_choice')),
  winner_number INTEGER,
  rich_content JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_raffles_user_status ON raffles(user_id, status);
CREATE INDEX IF NOT EXISTS idx_raffles_slug ON raffles(slug);
CREATE INDEX IF NOT EXISTS idx_raffles_visibility ON raffles(visibility, status);
