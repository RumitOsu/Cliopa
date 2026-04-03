import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Award,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart3,
  RefreshCw,
  Filter,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { CoachingService, AgentScorecard, PerformanceAlert } from '@/services/CoachingService';
import { RealtimeService } from '@/services/RealtimeService';
import { useAuth } from '@/hooks/useAuth';
import { AgentScorecardDetail } from './AgentScorecardDetail';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';

const SCORE_COLORS = {
  excellent: '#22c55e',
  good: '#84cc16',
  average: '#eab308',
  poor: '#f97316',
  critical: '#ef4444',
};

const getScoreColor = (score: number | null): string => {
  if (score === null) return '#6b7280';
  if (score >= 90) return SCORE_COLORS.excellent;
  if (score >= 80) return SCORE_COLORS.good;
  if (score >= 70) return SCORE_COLORS.average;
  if (score >= 60) return SCORE_COLORS.poor;
  return SCORE_COLORS.critical;
};

const getScoreLabel = (score: number | null): string => {
  if (score === null) return 'N/A';
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Average';
  if (score >= 60) return 'Needs Improvement';
  return 'Critical';
};

export const PerformanceDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scorecards, setScorecards] = useState<AgentScorecard[]>([]);
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [scorecardsData, alertsData] = await Promise.all([
        CoachingService.getAgentScorecards(teamFilter !== 'all' ? { team: teamFilter } : undefined),
        CoachingService.getAllAlerts({ limit: 20 }),
      ]);

      setScorecards(scorecardsData);
      setAlerts(alertsData);

      // Extract unique teams
      const uniqueTeams = [...new Set(scorecardsData.map((s) => s.team).filter(Boolean))] as string[];
      setTeams(uniqueTeams);
    } catch (error) {
      console.error('Error fetching performance data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load performance data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscription for updates
  useEffect(() => {
    const unsubscribe = RealtimeService.subscribeToReportCards(null, () => {
      // Refresh data when new report cards come in
      fetchData();
    });

    return unsubscribe;
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Calculate aggregate stats
  const agentsWithScores = scorecards.filter(s => s.audits_30d > 0);
  const aggregateStats = {
    totalAgents: scorecards.length,
    avgScore: agentsWithScores.length
      ? Math.round(agentsWithScores.reduce((acc, s) => acc + (s.avg_score_30d || 0), 0) / agentsWithScores.length)
      : 0,
    totalAudits: scorecards.reduce((acc, s) => acc + (s.audits_30d || 0), 0),
    activeGoals: scorecards.reduce((acc, s) => acc + (s.active_goals || 0), 0),
    criticalAlerts: alerts.filter((a) => a.severity === 'critical' && !a.is_acknowledged).length,
    improvingAgents: scorecards.filter((s) => s.score_change_wow > 0).length,
    decliningAgents: scorecards.filter((s) => s.score_change_wow < -5).length,
  };

  // Top performers (only agents who have audits)
  const topPerformers = [...scorecards]
    .filter((s) => s.audits_30d > 0 && s.avg_score_30d > 0)
    .sort((a, b) => (b.avg_score_30d || 0) - (a.avg_score_30d || 0))
    .slice(0, 5);

  // Needs attention (low scores or declining, among agents with audits)
  const needsAttention = scorecards
    .filter((s) => s.audits_30d > 0 && ((s.avg_score_30d > 0 && s.avg_score_30d < 75) || s.score_change_wow < -10))
    .sort((a, b) => (a.avg_score_30d || 100) - (b.avg_score_30d || 100))
    .slice(0, 5);

  // Chart data for team comparison
  const teamComparisonData = teams.map((team) => {
    const teamAgentsWithScores = scorecards.filter((s) => s.team === team && s.audits_30d > 0);
    const avgScore = teamAgentsWithScores.length
      ? teamAgentsWithScores.reduce((acc, s) => acc + (s.avg_score_30d || 0), 0) / teamAgentsWithScores.length
      : 0;
    return {
      team,
      score: Math.round(avgScore),
      agents: scorecards.filter((s) => s.team === team).length,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex items-center justify-end gap-3">
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-40 bg-[var(--color-surface)] border-[var(--color-border)]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team} value={team}>
                {team}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--color-subtext)]" />
              <span className="text-xs text-[var(--color-subtext)]">Agents</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)] mt-1">{aggregateStats.totalAgents}</p>
          </CardContent>
        </Card>

        <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[var(--color-subtext)]" />
              <span className="text-xs text-[var(--color-subtext)]">Avg Score</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: getScoreColor(aggregateStats.avgScore) }}>
              {aggregateStats.avgScore}%
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--color-subtext)]" />
              <span className="text-xs text-[var(--color-subtext)]">Audits (30d)</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)] mt-1">{aggregateStats.totalAudits}</p>
          </CardContent>
        </Card>

        <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--color-subtext)]" />
              <span className="text-xs text-[var(--color-subtext)]">Active Goals</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)] mt-1">{aggregateStats.activeGoals}</p>
          </CardContent>
        </Card>

        <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-xs text-[var(--color-subtext)]">Improving</span>
            </div>
            <p className="text-2xl font-bold text-green-500 mt-1">{aggregateStats.improvingAgents}</p>
          </CardContent>
        </Card>

        <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-[var(--color-subtext)]">Declining</span>
            </div>
            <p className="text-2xl font-bold text-orange-500 mt-1">{aggregateStats.decliningAgents}</p>
          </CardContent>
        </Card>

        <Card className={`border-[var(--color-border)] ${aggregateStats.criticalAlerts > 0 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-[var(--color-surface)]'}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${aggregateStats.criticalAlerts > 0 ? 'text-red-500' : 'text-[var(--color-subtext)]'}`} />
              <span className="text-xs text-[var(--color-subtext)]">Critical Alerts</span>
            </div>
            <p className={`text-2xl font-bold mt-1 ${aggregateStats.criticalAlerts > 0 ? 'text-red-500' : 'text-[var(--color-text)]'}`}>
              {aggregateStats.criticalAlerts}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Leaderboard & Needs Attention */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="leaderboard">
            <TabsList className="bg-[var(--color-surface)] border border-[var(--color-border)]">
              <TabsTrigger value="leaderboard" className="data-[state=active]:bg-[var(--color-accent)] data-[state=active]:text-white">
                <Award className="h-4 w-4 mr-2" />
                Top Performers
              </TabsTrigger>
              <TabsTrigger value="attention" className="data-[state=active]:bg-[var(--color-accent)] data-[state=active]:text-white">
                <AlertTriangle className="h-4 w-4 mr-2" />
                Needs Attention
              </TabsTrigger>
              <TabsTrigger value="all" className="data-[state=active]:bg-[var(--color-accent)] data-[state=active]:text-white">
                <Users className="h-4 w-4 mr-2" />
                All Agents
              </TabsTrigger>
            </TabsList>

            <TabsContent value="leaderboard">
              <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
                <CardHeader>
                  <CardTitle className="text-[var(--color-text)]">Top Performers (30 days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {topPerformers.map((agent, index) => (
                      <div
                        key={agent.agent_id}
                        className="flex items-center gap-4 p-3 rounded-lg bg-[var(--color-bg)] cursor-pointer hover:bg-[var(--color-surface)] transition-colors"
                        onClick={() => setSelectedAgentId(agent.agent_id)}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                          index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-[var(--color-accent)]'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-[var(--color-text)]">
                            {agent.first_name} {agent.last_name}
                          </p>
                          <p className="text-xs text-[var(--color-subtext)]">{agent.team || 'No Team'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold" style={{ color: getScoreColor(agent.avg_score_30d) }}>
                            {agent.avg_score_30d?.toFixed(1) || 'N/A'}%
                          </p>
                          {agent.score_change_wow !== null && (
                            <div className={`flex items-center justify-end text-xs ${agent.score_change_wow >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {agent.score_change_wow >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                              {agent.score_change_wow > 0 ? '+' : ''}{agent.score_change_wow?.toFixed(1)}%
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-[var(--color-subtext)]">
                          {agent.audits_30d} audits
                        </div>
                      </div>
                    ))}
                    {topPerformers.length === 0 && (
                      <p className="text-center text-[var(--color-subtext)] py-8">No performance data available</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attention">
              <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
                <CardHeader>
                  <CardTitle className="text-[var(--color-text)]">Needs Attention</CardTitle>
                  <CardDescription>Agents with low scores or declining performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {needsAttention.map((agent) => (
                      <div
                        key={agent.agent_id}
                        className="flex items-center gap-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors"
                        onClick={() => setSelectedAgentId(agent.agent_id)}
                      >
                        <div className="w-10 h-10 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white font-medium">
                          {agent.first_name?.charAt(0)}{agent.last_name?.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-[var(--color-text)]">
                            {agent.first_name} {agent.last_name}
                          </p>
                          <p className="text-xs text-[var(--color-subtext)]">{agent.team || 'No Team'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold" style={{ color: getScoreColor(agent.avg_score_30d) }}>
                            {agent.avg_score_30d?.toFixed(1) || 'N/A'}%
                          </p>
                          {agent.score_change_wow !== null && agent.score_change_wow < 0 && (
                            <div className="flex items-center justify-end text-xs text-red-500">
                              <TrendingDown className="h-3 w-3 mr-1" />
                              {agent.score_change_wow?.toFixed(1)}%
                            </div>
                          )}
                        </div>
                        <Button size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
                          <Clock className="h-3 w-3 mr-1" />
                          Schedule Coaching
                        </Button>
                      </div>
                    ))}
                    {needsAttention.length === 0 && (
                      <div className="text-center py-8">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                        <p className="text-[var(--color-text)] font-medium">All agents performing well!</p>
                        <p className="text-sm text-[var(--color-subtext)]">No immediate attention needed</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="all">
              <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
                <CardHeader>
                  <CardTitle className="text-[var(--color-text)]">All Agents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {scorecards.map((agent) => (
                      <div
                        key={agent.agent_id}
                        className="flex items-center gap-4 p-3 rounded-lg bg-[var(--color-bg)] cursor-pointer hover:bg-[var(--color-surface)] transition-colors"
                        onClick={() => setSelectedAgentId(agent.agent_id)}
                      >
                        <div className="w-10 h-10 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white font-medium">
                          {agent.first_name?.charAt(0)}{agent.last_name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--color-text)] truncate">
                            {agent.first_name} {agent.last_name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[var(--color-subtext)]">
                            <span>{agent.team || 'No Team'}</span>
                            <span>•</span>
                            <span>{agent.audits_30d} audits</span>
                            <span>•</span>
                            <span>{agent.active_goals} goals</span>
                          </div>
                        </div>
                        <div className="w-32">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-[var(--color-subtext)]">Score</span>
                            <span className="font-medium" style={{ color: getScoreColor(agent.avg_score_30d) }}>
                              {agent.avg_score_30d?.toFixed(1) || 'N/A'}%
                            </span>
                          </div>
                          <Progress
                            value={agent.avg_score_30d || 0}
                            className="h-2"
                          />
                        </div>
                        <ChevronRight className="h-4 w-4 text-[var(--color-subtext)]" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Team Comparison Chart */}
          {teams.length > 1 && (
            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardHeader>
                <CardTitle className="text-[var(--color-text)]">Team Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={teamComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="team" stroke="var(--color-subtext)" fontSize={12} />
                    <YAxis stroke="var(--color-subtext)" fontSize={12} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="score" name="Avg Score">
                      {teamComparisonData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Alerts Sidebar */}
        <div className="space-y-6">
          <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
            <CardHeader>
              <CardTitle className="text-[var(--color-text)] flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Recent Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {alerts.slice(0, 10).map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${
                      alert.severity === 'critical'
                        ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                        : alert.severity === 'warning'
                        ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'
                        : alert.severity === 'success'
                        ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                        : 'bg-[var(--color-bg)] border-[var(--color-border)]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Badge
                        variant={
                          alert.severity === 'critical'
                            ? 'destructive'
                            : alert.severity === 'success'
                            ? 'default'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {alert.severity}
                      </Badge>
                      {!alert.is_read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 mt-1" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-[var(--color-text)] mt-1">{alert.title}</p>
                    <p className="text-xs text-[var(--color-subtext)] mt-1">{alert.message}</p>
                    <p className="text-xs text-[var(--color-subtext)] mt-2">
                      {new Date(alert.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
                {alerts.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-[var(--color-subtext)]">No alerts</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
            <CardHeader>
              <CardTitle className="text-[var(--color-text)]">Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Excellent (90+)', min: 90, max: 100, color: SCORE_COLORS.excellent },
                  { label: 'Good (80-89)', min: 80, max: 89, color: SCORE_COLORS.good },
                  { label: 'Average (70-79)', min: 70, max: 79, color: SCORE_COLORS.average },
                  { label: 'Poor (60-69)', min: 60, max: 69, color: SCORE_COLORS.poor },
                  { label: 'Critical (<60)', min: 0, max: 59, color: SCORE_COLORS.critical },
                ].map(({ label, min, max, color }) => {
                  const count = scorecards.filter(
                    (s) => s.avg_score_30d !== null && s.avg_score_30d >= min && s.avg_score_30d <= max
                  ).length;
                  const percentage = scorecards.length ? (count / scorecards.length) * 100 : 0;

                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-[var(--color-subtext)]">{label}</span>
                        <span className="font-medium text-[var(--color-text)]">{count}</span>
                      </div>
                      <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percentage}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Agent Scorecard Detail Modal */}
      {selectedAgentId && (
        <AgentScorecardDetail
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </div>
  );
};
