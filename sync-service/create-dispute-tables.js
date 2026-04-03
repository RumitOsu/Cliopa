/**
 * Creates score_disputes, dispute_comments, and dispute_history tables
 * using direct PostgreSQL connection (bypasses PostgREST).
 *
 * Usage: node create-dispute-tables.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres.zkywapiptgpnfkacpyrz:' + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || '') + '@aws-0-us-west-1.pooler.supabase.com:6543/postgres';

const SQL = `
-- Score disputes table
CREATE TABLE IF NOT EXISTS public.score_disputes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    report_card_id UUID NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    dispute_reason TEXT NOT NULL,
    criteria_disputed JSONB DEFAULT '[]',
    supporting_evidence TEXT,
    requested_scores JSONB,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'under_review', 'approved', 'partially_approved', 'rejected', 'withdrawn'
    )),
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    resolution_notes TEXT,
    adjusted_scores JSONB,
    criteria_adjustments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_report_card ON score_disputes(report_card_id);
CREATE INDEX IF NOT EXISTS idx_disputes_user ON score_disputes(user_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON score_disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_created ON score_disputes(created_at DESC);

-- Dispute comments table
CREATE TABLE IF NOT EXISTS public.dispute_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dispute_id UUID NOT NULL REFERENCES score_disputes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_comments_dispute ON dispute_comments(dispute_id);

-- Dispute history table
CREATE TABLE IF NOT EXISTS public.dispute_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dispute_id UUID NOT NULL REFERENCES score_disputes(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    performed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_history_dispute ON dispute_history(dispute_id);

-- Enable RLS
ALTER TABLE public.score_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'score_disputes' AND policyname = 'Users manage own disputes') THEN
    CREATE POLICY "Users manage own disputes" ON score_disputes FOR ALL
      USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispute_comments' AND policyname = 'Users manage dispute comments') THEN
    CREATE POLICY "Users manage dispute comments" ON dispute_comments FOR ALL
      USING (
        (EXISTS (SELECT 1 FROM score_disputes sd WHERE sd.id = dispute_comments.dispute_id AND sd.user_id = auth.uid()) AND NOT is_internal)
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispute_history' AND policyname = 'Users view dispute history') THEN
    CREATE POLICY "Users view dispute history" ON dispute_history FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM score_disputes sd WHERE sd.id = dispute_history.dispute_id
          AND (sd.user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))))
      );
  END IF;
END $$;

-- Grants
GRANT SELECT, INSERT, UPDATE ON score_disputes TO authenticated;
GRANT SELECT, INSERT ON dispute_comments TO authenticated;
GRANT SELECT ON dispute_history TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
`;

async function main() {
  console.log('Creating score_disputes, dispute_comments, dispute_history tables...');

  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('Connected to database');
    await client.query(SQL);
    console.log('✓ Tables created successfully');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
