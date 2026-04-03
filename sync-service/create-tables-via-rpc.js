/**
 * Creates missing tables by first creating a SECURITY DEFINER function via
 * Supabase service-role, executing it, then cleaning up.
 *
 * Uses the Supabase Management API (not PostgREST) to run raw SQL.
 */
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zkywapiptgpnfkacpyrz.supabase.co';
const PROJECT_REF = 'zkywapiptgpnfkacpyrz';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// We need the Supabase Management API key (dashboard token) or the db password
// Alternative: use the SQL Editor API endpoint

const SQL = `
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

CREATE TABLE IF NOT EXISTS public.dispute_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dispute_id UUID NOT NULL REFERENCES score_disputes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_comments_dispute ON dispute_comments(dispute_id);

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

ALTER TABLE public.score_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_history ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT, UPDATE ON score_disputes TO authenticated;
GRANT SELECT, INSERT ON dispute_comments TO authenticated;
GRANT SELECT ON dispute_history TO authenticated;

NOTIFY pgrst, 'reload schema';
`;

async function main() {
  console.log('Attempting to create dispute tables...\n');

  // Method 1: Try using a temporary SECURITY DEFINER function
  const fnSQL = `
    CREATE OR REPLACE FUNCTION public._temp_create_dispute_tables()
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      ${SQL.replace(/\$/g, '\\$')}
    END;
    $$;
  `;

  // This won't work via PostgREST either since we can't CREATE FUNCTION via REST.
  // Let's try the direct approach - just call the Supabase SQL API.

  // Method 2: Supabase provides a SQL query endpoint at /pg/query for service role
  const resp = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  });

  if (resp.ok) {
    console.log('✓ Tables created via /pg/query');
    return;
  }

  console.log(`/pg/query returned ${resp.status}: ${await resp.text()}`);
  console.log('\nThe dispute tables need to be created via the Supabase SQL Editor.');
  console.log('Please run the SQL from: sync-service/create-dispute-tables.sql');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
