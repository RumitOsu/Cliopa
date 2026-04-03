-- Add missing RLS policy: Managers can view all report cards
-- The consolidated schema defines this policy but it was never applied to production.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'report_cards' AND policyname = 'Managers can view all report cards'
  ) THEN
    CREATE POLICY "Managers can view all report cards" ON public.report_cards
      FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
  END IF;
END $$;

-- Also ensure managers can view all calls
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calls' AND policyname = 'Managers can view all calls'
  ) THEN
    CREATE POLICY "Managers can view all calls" ON public.calls
      FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
  END IF;
END $$;
