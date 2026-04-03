import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://zkywapiptgpnfkacpyrz.supabase.co';

const supabase = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Verify the request has a valid Supabase auth token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Verify the token and get the user
  const anonClient = createClient(
    SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check if user is admin or manager
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    // Non-managers only see their own report cards
    const { data, error } = await supabase
      .from('report_cards')
      .select('*, profiles:user_id (first_name, last_name, email, team)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // Managers/admins see all report cards
  const { team, userId, limit: queryLimit } = req.query;

  let query = supabase
    .from('report_cards')
    .select('*, profiles:user_id (first_name, last_name, email, team)')
    .order('created_at', { ascending: false });

  if (team) {
    query = query.eq('profiles.team', team);
  }
  if (userId) {
    query = query.eq('user_id', userId);
  }
  if (queryLimit) {
    query = query.limit(parseInt(queryLimit));
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
}
