import { supabase } from "@/integrations/supabase/client";

export interface ReportCard {
  id: string;
  user_id: string;
  call_id?: string;
  source_file?: string;
  source_type: 'call' | 'manual_upload' | 'transcript';
  overall_score: number;
  communication_score?: number;
  compliance_score?: number;
  accuracy_score?: number;
  tone_score?: number;
  empathy_score?: number;
  resolution_score?: number;
  feedback?: string;
  strengths?: string[];
  areas_for_improvement?: string[];
  recommendations?: string[];
  criteria_results?: any;
  ai_model?: string;
  ai_provider?: string;
  processing_time_ms?: number;
  created_at: string;
  updated_at: string;
}

export interface ReportCardWithProfile extends ReportCard {
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
    team?: string;
  } | null;
}

// Get all report cards for current user
export const ReportCardsSelectForUser = async (userId: string) => {
  const { data, error } = await supabase
    .from("report_cards")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return { reportCards: data, error };
};

// Get all report cards with profile info (manager view)
// Uses a SECURITY DEFINER function to bypass RLS
export const ReportCardsSelectAllWithProfiles = async () => {
  // Step 1: Get all report cards via RPC (bypasses RLS)
  const { data: cards, error: rpcError } = await supabase.rpc('get_report_cards_for_manager');
  if (rpcError) return { reportCards: null, error: rpcError };

  // Step 2: Get profile info for all unique user_ids
  const userIds = [...new Set((cards || []).map((c: any) => c.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, team")
    .in("id", userIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  // Step 3: Merge
  const merged = (cards || []).map((c: any) => ({
    ...c,
    profiles: profileMap.get(c.user_id) || null,
  }));

  return { reportCards: merged as ReportCardWithProfile[], error: null };
};

// Get report cards filtered by team (uses RPC to bypass RLS)
export const ReportCardsSelectByTeam = async (team: string) => {
  const { reportCards, error } = await ReportCardsSelectAllWithProfiles();
  if (error) return { reportCards: null, error };

  const filtered = (reportCards || []).filter(
    (rc) => rc.profiles?.team === team
  );
  return { reportCards: filtered, error: null };
};

// Get report cards for date range
export const ReportCardsSelectByDateRange = async (
  startDate: string,
  endDate: string
) => {
  const { data, error } = await supabase
    .from("report_cards")
    .select(`
      *,
      profiles:user_id (
        first_name,
        last_name,
        email,
        team
      )
    `)
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: false });

  return { reportCards: data as ReportCardWithProfile[], error };
};

// Get single report card by ID
export const ReportCardsSelectById = async (id: string) => {
  const { data, error } = await supabase
    .from("report_cards")
    .select(`
      *,
      profiles:user_id (
        first_name,
        last_name,
        email,
        team
      )
    `)
    .eq("id", id)
    .single();

  return { reportCard: data as ReportCardWithProfile, error };
};

// Insert new report card
export const ReportCardsInsert = async (reportCard: Partial<ReportCard>) => {
  const { data, error } = await supabase
    .from("report_cards")
    .insert(reportCard)
    .select()
    .single();

  return { reportCard: data, error };
};

// Get agent performance summary (uses view)
export const AgentPerformanceSummarySelect = async () => {
  const { data, error } = await supabase
    .from("agent_performance_summary")
    .select("*")
    .order("avg_overall_score", { ascending: false });

  return { performanceSummary: data, error };
};

// Get performance summary for specific user
export const AgentPerformanceSummarySelectForUser = async (userId: string) => {
  const { data, error } = await supabase
    .from("agent_performance_summary")
    .select("*")
    .eq("user_id", userId)
    .single();

  return { performanceSummary: data, error };
};

// Get performance trends over time for a user
export const ReportCardsTrendData = async (
  userId: string,
  days: number = 30
) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from("report_cards")
    .select("created_at, overall_score, communication_score, compliance_score")
    .eq("user_id", userId)
    .gte("created_at", startDate.toISOString())
    .order("created_at", { ascending: true });

  return { trendData: data, error };
};
