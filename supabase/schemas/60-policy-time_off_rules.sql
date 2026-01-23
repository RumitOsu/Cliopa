-- Enable RLS on time_off_rules table
ALTER TABLE public.time_off_rules ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read time off rules
CREATE POLICY "Authenticated users can view time off rules"
ON public.time_off_rules
FOR SELECT
TO authenticated
USING (true);

-- Only admins/managers can insert/update/delete rules (optional, for future admin UI)
CREATE POLICY "Admins can manage time off rules"
ON public.time_off_rules
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager')
    )
);
