import { supabase } from '@/integrations/supabase/client';

export interface CoachingSession {
  id: string;
  agent_id: string;
  coach_id: string;
  session_type: 'one_on_one' | 'group' | 'self_review' | 'performance_review' | 'skill_development';
  title: string;
  description?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  scheduled_at: string;
  duration_minutes: number;
  completed_at?: string;
  related_call_id?: string;
  related_report_card_id?: string;
  agenda: { item: string; completed: boolean }[];
  notes?: string;
  action_items: { task: string; completed: boolean; due_date?: string }[];
  agent_feedback?: string;
  coach_feedback?: string;
  rating?: number;
  created_at: string;
  updated_at: string;
  // Joined data
  agent?: { first_name: string; last_name: string; email: string; team?: string };
  coach?: { first_name: string; last_name: string; email: string };
}

export interface AgentGoal {
  id: string;
  agent_id: string;
  created_by: string;
  title: string;
  description?: string;
  category: 'quality' | 'efficiency' | 'compliance' | 'communication' | 'development' | 'custom';
  metric_type: 'score' | 'count' | 'percentage' | 'time' | 'custom';
  target_value: number;
  current_value: number;
  baseline_value?: number;
  start_date: string;
  target_date: string;
  completed_date?: string;
  status: 'active' | 'completed' | 'missed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  milestones: { title: string; target: number; achieved: boolean; date?: string }[];
  progress_history: { date: string; value: number }[];
  created_at: string;
  updated_at: string;
  // Joined data
  agent?: { first_name: string; last_name: string; email: string };
}

export interface PerformanceAlert {
  id: string;
  user_id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  related_entity_type?: string;
  related_entity_id?: string;
  metadata: Record<string, any>;
  is_read: boolean;
  is_acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  action_url?: string;
  action_label?: string;
  created_at: string;
  expires_at?: string;
}

export interface AgentScorecard {
  agent_id: string;
  first_name: string;
  last_name: string;
  email: string;
  team?: string;
  role: string;
  audits_30d: number;
  avg_score_30d: number;
  compliance_30d: number;
  communication_30d: number;
  empathy_30d: number;
  score_change_wow: number;
  active_goals: number;
  goals_completed_30d: number;
  coaching_sessions_30d: number;
  next_coaching_session?: string;
  hours_worked_30d: number;
}

export const CoachingService = {
  // ============================================
  // Coaching Sessions
  // ============================================

  async getCoachingSessions(filters?: {
    agentId?: string;
    coachId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<CoachingSession[]> {
    let query = supabase
      .from('coaching_sessions')
      .select(`
        *,
        agent:agent_id (first_name, last_name, email, team),
        coach:coach_id (first_name, last_name, email)
      `)
      .order('scheduled_at', { ascending: true });

    if (filters?.agentId) {
      query = query.eq('agent_id', filters.agentId);
    }
    if (filters?.coachId) {
      query = query.eq('coach_id', filters.coachId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.startDate) {
      query = query.gte('scheduled_at', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('scheduled_at', filters.endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getUpcomingCoachingSessions(userId: string): Promise<CoachingSession[]> {
    const { data, error } = await supabase
      .from('coaching_sessions')
      .select(`
        *,
        agent:agent_id (first_name, last_name, email, team),
        coach:coach_id (first_name, last_name, email)
      `)
      .or(`agent_id.eq.${userId},coach_id.eq.${userId}`)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (error) throw error;
    return data || [];
  },

  async createCoachingSession(session: Partial<CoachingSession>): Promise<CoachingSession> {
    const { data, error } = await supabase
      .from('coaching_sessions')
      .insert(session)
      .select(`
        *,
        agent:agent_id (first_name, last_name, email, team),
        coach:coach_id (first_name, last_name, email)
      `)
      .single();

    if (error) throw error;
    return data;
  },

  async updateCoachingSession(id: string, updates: Partial<CoachingSession>): Promise<CoachingSession> {
    const { data, error } = await supabase
      .from('coaching_sessions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`
        *,
        agent:agent_id (first_name, last_name, email, team),
        coach:coach_id (first_name, last_name, email)
      `)
      .single();

    if (error) throw error;
    return data;
  },

  async completeCoachingSession(
    id: string,
    notes: string,
    actionItems: { task: string; completed: boolean; due_date?: string }[],
    coachFeedback?: string,
    rating?: number
  ): Promise<CoachingSession> {
    return this.updateCoachingSession(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      notes,
      action_items: actionItems,
      coach_feedback: coachFeedback,
      rating,
    });
  },

  // ============================================
  // Agent Goals
  // ============================================

  async getAgentGoals(filters?: {
    agentId?: string;
    status?: string;
    category?: string;
  }): Promise<AgentGoal[]> {
    let query = supabase
      .from('agent_goals')
      .select(`
        *,
        agent:agent_id (first_name, last_name, email)
      `)
      .order('target_date', { ascending: true });

    if (filters?.agentId) {
      query = query.eq('agent_id', filters.agentId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createGoal(goal: Partial<AgentGoal>): Promise<AgentGoal> {
    const { data, error } = await supabase
      .from('agent_goals')
      .insert(goal)
      .select(`
        *,
        agent:agent_id (first_name, last_name, email)
      `)
      .single();

    if (error) throw error;
    return data;
  },

  async updateGoal(id: string, updates: Partial<AgentGoal>): Promise<AgentGoal> {
    const { data, error } = await supabase
      .from('agent_goals')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`
        *,
        agent:agent_id (first_name, last_name, email)
      `)
      .single();

    if (error) throw error;
    return data;
  },

  async updateGoalProgress(id: string, newValue: number): Promise<AgentGoal> {
    // First get current goal to update progress history
    const { data: current, error: fetchError } = await supabase
      .from('agent_goals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const progressHistory = current.progress_history || [];
    progressHistory.push({ date: new Date().toISOString(), value: newValue });

    // Check if goal is completed
    const isCompleted = newValue >= current.target_value;

    const { data, error } = await supabase
      .from('agent_goals')
      .update({
        current_value: newValue,
        progress_history: progressHistory,
        status: isCompleted ? 'completed' : 'active',
        completed_date: isCompleted ? new Date().toISOString().split('T')[0] : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        agent:agent_id (first_name, last_name, email)
      `)
      .single();

    if (error) throw error;
    return data;
  },

  // ============================================
  // Performance Alerts
  // ============================================

  async getAlerts(userId: string, filters?: {
    unreadOnly?: boolean;
    severity?: string;
    limit?: number;
  }): Promise<PerformanceAlert[]> {
    let query = supabase
      .from('performance_alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters?.unreadOnly) {
      query = query.eq('is_read', false);
    }
    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getAllAlerts(filters?: {
    unreadOnly?: boolean;
    severity?: string;
    alertType?: string;
    limit?: number;
  }): Promise<PerformanceAlert[]> {
    let query = supabase
      .from('performance_alerts')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.unreadOnly) {
      query = query.eq('is_read', false);
    }
    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (filters?.alertType) {
      query = query.eq('alert_type', filters.alertType);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async markAlertRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('performance_alerts')
      .update({ is_read: true })
      .eq('id', id);

    if (error) throw error;
  },

  async acknowledgeAlert(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('performance_alerts')
      .update({
        is_acknowledged: true,
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  },

  async createAlert(alert: {
    userId: string;
    alertType: string;
    severity: 'info' | 'warning' | 'critical' | 'success';
    title: string;
    message: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    metadata?: Record<string, any>;
    actionUrl?: string;
    actionLabel?: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('create_performance_alert', {
      p_user_id: alert.userId,
      p_alert_type: alert.alertType,
      p_severity: alert.severity,
      p_title: alert.title,
      p_message: alert.message,
      p_related_entity_type: alert.relatedEntityType,
      p_related_entity_id: alert.relatedEntityId,
      p_metadata: alert.metadata || {},
      p_action_url: alert.actionUrl,
      p_action_label: alert.actionLabel,
    });

    if (error) throw error;
    return data;
  },

  // ============================================
  // Agent Scorecards (Aggregated Performance)
  // Uses the agent_performance_summary view (server-side, RLS-safe)
  // for score data, plus individual table queries for goals/coaching.
  // ============================================

  async getAgentScorecards(filters?: {
    team?: string;
    agentId?: string;
  }): Promise<AgentScorecard[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    // 1. Use the agent_performance_summary view (correct 30-day aggregation, no RLS issues)
    let summaryQuery = supabase
      .from('agent_performance_summary')
      .select('*')
      .order('avg_overall_score', { ascending: false, nullsFirst: false });

    if (filters?.team) summaryQuery = summaryQuery.eq('team', filters.team);
    if (filters?.agentId) summaryQuery = summaryQuery.eq('user_id', filters.agentId);

    const { data: summaries, error: summaryErr } = await summaryQuery;
    if (summaryErr) throw summaryErr;
    if (!summaries?.length) return [];

    // Filter out admin profiles
    const agentSummaries = summaries.filter(s => s.role !== 'admin');
    const agentIds = agentSummaries.map(s => s.user_id);

    // 2. Fetch goals, coaching, time entries in parallel
    const [goalsRes, coachingRes, timeRes] = await Promise.all([
      supabase.from('agent_goals').select('agent_id, status, completed_date').in('agent_id', agentIds),
      supabase.from('coaching_sessions').select('agent_id, status, completed_at, scheduled_at').in('agent_id', agentIds),
      supabase.from('time_entries').select('user_id, total_hours, start_time').in('user_id', agentIds).gte('start_time', thirtyDaysAgo),
    ]);

    const goals = goalsRes.data || [];
    const coaching = coachingRes.data || [];
    const timeEntries = timeRes.data || [];

    // 3. Map view data to AgentScorecard interface
    const scorecards: AgentScorecard[] = agentSummaries.map(s => {
      const agentGoals = goals.filter(g => g.agent_id === s.user_id);
      const agentCoaching = coaching.filter(c => c.agent_id === s.user_id);
      const agentTime = timeEntries.filter(t => t.user_id === s.user_id);

      return {
        agent_id: s.user_id,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        team: s.team,
        role: s.role || '',
        audits_30d: s.total_audits || 0,
        avg_score_30d: s.avg_overall_score ? Math.round(s.avg_overall_score * 10) / 10 : null as unknown as number,
        compliance_30d: s.avg_compliance_score ? Math.round(s.avg_compliance_score * 10) / 10 : null as unknown as number,
        communication_30d: s.avg_communication_score ? Math.round(s.avg_communication_score * 10) / 10 : null as unknown as number,
        empathy_30d: s.avg_empathy_score ? Math.round(s.avg_empathy_score * 10) / 10 : null as unknown as number,
        score_change_wow: 0, // View doesn't have week-over-week; will compute if needed
        active_goals: agentGoals.filter(g => g.status === 'active').length,
        goals_completed_30d: agentGoals.filter(g => g.status === 'completed' && g.completed_date && g.completed_date >= thirtyDaysAgo).length,
        coaching_sessions_30d: agentCoaching.filter(c => c.status === 'completed' && c.completed_at && c.completed_at >= thirtyDaysAgo).length,
        next_coaching_session: agentCoaching
          .filter(c => c.status === 'scheduled' && c.scheduled_at && c.scheduled_at > now.toISOString())
          .sort((a, b) => (a.scheduled_at! > b.scheduled_at! ? 1 : -1))[0]?.scheduled_at,
        hours_worked_30d: Math.round((agentTime.reduce((sum, t) => sum + (t.total_hours || 0), 0)) * 10) / 10,
      };
    });

    return scorecards;
  },

  async getAgentScorecard(agentId: string): Promise<AgentScorecard | null> {
    const results = await this.getAgentScorecards({ agentId });
    return results[0] || null;
  },
};
