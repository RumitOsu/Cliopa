import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  User,
  Phone,
  Clock,
  TrendingUp,
  TrendingDown,
  Filter,
  Download,
  RefreshCw,
  FileText,
  Play,
  Search,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Target,
  Award,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ReportCardViewer } from '@/components/admin/ReportCardViewer';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface ReportCardWithCall {
  id: string;
  user_id: string;
  call_id?: string;
  overall_score: number;
  compliance_score?: number;
  communication_score?: number;
  empathy_score?: number;
  accuracy_score?: number;
  tone_score?: number;
  feedback?: string;
  strengths?: string[];
  areas_for_improvement?: string[];
  created_at: string;
  profiles?: {
    first_name: string;
    last_name: string;
    email: string;
    team?: string;
  };
  call?: {
    id: string;
    call_start_time?: string;
    call_duration_seconds?: number;
    recording_url?: string;
    campaign_name?: string;
    disposition?: string;
  };
}

interface RepSummary {
  userId: string;
  name: string;
  team: string;
  email: string;
  totalAudits: number;
  avgOverall: number;
  avgCompliance: number;
  avgCommunication: number;
  avgEmpathy: number;
  trend: 'up' | 'down' | 'stable';
  recentScores: number[];
  lowScoreCount: number;
  highScoreCount: number;
}

const SCORE_COLORS = {
  excellent: '#22c55e',
  good: '#84cc16',
  average: '#eab308',
  poor: '#f97316',
  critical: '#ef4444',
};

const PIE_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];

const getScoreColor = (score: number): string => {
  if (score >= 90) return 'text-green-500';
  if (score >= 80) return 'text-lime-500';
  if (score >= 70) return 'text-yellow-500';
  if (score >= 60) return 'text-orange-500';
  return 'text-red-500';
};

const getScoreLabel = (score: number): string => {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Average';
  if (score >= 60) return 'Needs Improvement';
  return 'Critical';
};

const AdminReportsPage = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportCards, setReportCards] = useState<ReportCardWithCall[]>([]);
  const [repSummaries, setRepSummaries] = useState<RepSummary[]>([]);

  // Filters
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('30');
  const [scoreFilter, setScoreFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // UI State
  const [activeTab, setActiveTab] = useState('overview');
  const [viewingReportCardId, setViewingReportCardId] = useState<string | null>(null);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Calculate date range
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      // Use SECURITY DEFINER RPC to bypass RLS for manager access
      const { data: cards, error: rpcError } = await supabase.rpc('get_report_cards_for_manager');
      if (rpcError) throw rpcError;

      // Filter by date range
      const filtered = (cards || []).filter((c: any) => new Date(c.created_at) >= startDate);

      // Get profiles and calls for the filtered cards
      const userIds = [...new Set(filtered.map((c: any) => c.user_id))];
      const callIds = filtered.map((c: any) => c.call_id).filter(Boolean);

      const [profilesRes, callsRes] = await Promise.all([
        userIds.length ? supabase.from('profiles').select('id, first_name, last_name, email, team').in('id', userIds) : { data: [] },
        callIds.length ? supabase.from('calls').select('id, call_start_time, call_duration_seconds, recording_url, campaign_name, disposition').in('id', callIds) : { data: [] },
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
      const callMap = new Map((callsRes.data || []).map((c: any) => [c.id, c]));

      // Merge and sort
      const data = filtered
        .map((c: any) => ({
          ...c,
          profiles: profileMap.get(c.user_id) || null,
          call: callMap.get(c.call_id) || null,
        }))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setReportCards(data || []);

      // Calculate rep summaries
      const repData: Record<string, RepSummary> = {};

      (data || []).forEach((rc: ReportCardWithCall) => {
        const userId = rc.user_id;
        if (!repData[userId]) {
          repData[userId] = {
            userId,
            name: `${rc.profiles?.first_name || ''} ${rc.profiles?.last_name || ''}`.trim() || 'Unknown',
            team: rc.profiles?.team || 'No Team',
            email: rc.profiles?.email || '',
            totalAudits: 0,
            avgOverall: 0,
            avgCompliance: 0,
            avgCommunication: 0,
            avgEmpathy: 0,
            trend: 'stable',
            recentScores: [],
            lowScoreCount: 0,
            highScoreCount: 0,
          };
        }

        repData[userId].totalAudits++;
        repData[userId].recentScores.push(rc.overall_score);

        if (rc.overall_score >= 85) repData[userId].highScoreCount++;
        if (rc.overall_score < 70) repData[userId].lowScoreCount++;
      });

      // Calculate averages and trends
      Object.values(repData).forEach((rep) => {
        const scores = rep.recentScores;
        if (scores.length > 0) {
          rep.avgOverall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        }

        const repCards = (data || []).filter((rc: ReportCardWithCall) => rc.user_id === rep.userId);
        const compScores = repCards.filter((rc: ReportCardWithCall) => rc.compliance_score).map((rc: ReportCardWithCall) => rc.compliance_score!);
        const commScores = repCards.filter((rc: ReportCardWithCall) => rc.communication_score).map((rc: ReportCardWithCall) => rc.communication_score!);
        const empScores = repCards.filter((rc: ReportCardWithCall) => rc.empathy_score).map((rc: ReportCardWithCall) => rc.empathy_score!);

        if (compScores.length) rep.avgCompliance = Math.round(compScores.reduce((a, b) => a + b, 0) / compScores.length);
        if (commScores.length) rep.avgCommunication = Math.round(commScores.reduce((a, b) => a + b, 0) / commScores.length);
        if (empScores.length) rep.avgEmpathy = Math.round(empScores.reduce((a, b) => a + b, 0) / empScores.length);

        // Calculate trend
        if (scores.length >= 4) {
          const mid = Math.floor(scores.length / 2);
          const firstHalf = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
          const secondHalf = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid);
          if (secondHalf > firstHalf + 3) rep.trend = 'up';
          else if (secondHalf < firstHalf - 3) rep.trend = 'down';
        }
      });

      setRepSummaries(Object.values(repData).sort((a, b) => b.avgOverall - a.avgOverall));

    } catch (error) {
      console.error('Error fetching report data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load report data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [dateRange, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get unique teams
  const teams = Array.from(new Set(repSummaries.map(r => r.team).filter(Boolean)));

  // Filter report cards
  const filteredReportCards = reportCards.filter(rc => {
    if (selectedRep !== 'all' && rc.user_id !== selectedRep) return false;
    if (selectedTeam !== 'all' && rc.profiles?.team !== selectedTeam) return false;
    if (scoreFilter === 'high' && rc.overall_score < 85) return false;
    if (scoreFilter === 'low' && rc.overall_score >= 70) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = `${rc.profiles?.first_name} ${rc.profiles?.last_name}`.toLowerCase();
      if (!name.includes(query) && !rc.profiles?.email?.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  // Filter rep summaries
  const filteredRepSummaries = repSummaries.filter(rep => {
    if (selectedTeam !== 'all' && rep.team !== selectedTeam) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!rep.name.toLowerCase().includes(query) && !rep.email.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  // Calculate overview stats
  const overallStats = {
    totalAudits: filteredReportCards.length,
    avgScore: filteredReportCards.length > 0
      ? Math.round(filteredReportCards.reduce((sum, rc) => sum + rc.overall_score, 0) / filteredReportCards.length)
      : 0,
    highPerformers: filteredReportCards.filter(rc => rc.overall_score >= 85).length,
    needsAttention: filteredReportCards.filter(rc => rc.overall_score < 70).length,
  };

  // Score distribution for pie chart
  const scoreDistribution = [
    { name: 'Excellent (90+)', value: filteredReportCards.filter(rc => rc.overall_score >= 90).length },
    { name: 'Good (80-89)', value: filteredReportCards.filter(rc => rc.overall_score >= 80 && rc.overall_score < 90).length },
    { name: 'Average (70-79)', value: filteredReportCards.filter(rc => rc.overall_score >= 70 && rc.overall_score < 80).length },
    { name: 'Needs Work (60-69)', value: filteredReportCards.filter(rc => rc.overall_score >= 60 && rc.overall_score < 70).length },
    { name: 'Critical (<60)', value: filteredReportCards.filter(rc => rc.overall_score < 60).length },
  ].filter(d => d.value > 0);

  // Chart data for rep comparison
  const repChartData = filteredRepSummaries.slice(0, 10).map(rep => ({
    name: rep.name.split(' ')[0],
    overall: rep.avgOverall,
    compliance: rep.avgCompliance,
    communication: rep.avgCommunication,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => fetchData()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label className="text-[var(--color-text)]">Time Period</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="14">Last 14 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="60">Last 60 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--color-text)]">Team</Label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger>
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams.map(team => (
                    <SelectItem key={team} value={team}>{team}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--color-text)]">Rep</Label>
              <Select value={selectedRep} onValueChange={setSelectedRep}>
                <SelectTrigger>
                  <SelectValue placeholder="All Reps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reps</SelectItem>
                  {repSummaries.map(rep => (
                    <SelectItem key={rep.userId} value={rep.userId}>{rep.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--color-text)]">Score Filter</Label>
              <Select value={scoreFilter} onValueChange={setScoreFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scores</SelectItem>
                  <SelectItem value="high">High Performers (85+)</SelectItem>
                  <SelectItem value="low">Needs Attention (&lt;70)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--color-text)]">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-subtext)]" />
                <Input
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="reps">
            <User className="h-4 w-4 mr-2" />
            Rep Insights
          </TabsTrigger>
          <TabsTrigger value="calls">
            <Phone className="h-4 w-4 mr-2" />
            All Audits
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--color-subtext)]">Total Audits</p>
                    <p className="text-3xl font-bold text-[var(--color-text)]">{overallStats.totalAudits}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Phone className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--color-subtext)]">Average Score</p>
                    <p className={`text-3xl font-bold ${getScoreColor(overallStats.avgScore)}`}>
                      {overallStats.avgScore}%
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Target className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--color-subtext)]">High Performers</p>
                    <p className="text-3xl font-bold text-green-500">{overallStats.highPerformers}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Award className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--color-subtext)]">Needs Attention</p>
                    <p className="text-3xl font-bold text-orange-500">{overallStats.needsAttention}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardHeader>
                <CardTitle className="text-[var(--color-text)]">Score Distribution</CardTitle>
                <CardDescription>Breakdown of audit scores</CardDescription>
              </CardHeader>
              <CardContent>
                {scoreDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={scoreDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {scoreDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-[var(--color-subtext)]">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardHeader>
                <CardTitle className="text-[var(--color-text)]">Rep Performance Comparison</CardTitle>
                <CardDescription>Top 10 reps by average score</CardDescription>
              </CardHeader>
              <CardContent>
                {repChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={repChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="overall" name="Overall" fill="var(--color-accent)" />
                      <Bar dataKey="compliance" name="Compliance" fill="#3b82f6" />
                      <Bar dataKey="communication" name="Communication" fill="#22c55e" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-[var(--color-subtext)]">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Rep Insights Tab */}
        <TabsContent value="reps" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRepSummaries.map((rep) => (
              <Card
                key={rep.userId}
                className="bg-[var(--color-surface)] border-[var(--color-border)] cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setExpandedRep(expandedRep === rep.userId ? null : rep.userId)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-[var(--color-text)]">{rep.name}</h3>
                      <p className="text-sm text-[var(--color-subtext)]">{rep.team}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${getScoreColor(rep.avgOverall)}`}>
                        {rep.avgOverall}%
                      </p>
                      <div className="flex items-center gap-1 justify-end">
                        {rep.trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                        {rep.trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                        <span className="text-xs text-[var(--color-subtext)]">
                          {rep.totalAudits} audits
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    <div className="bg-[var(--color-bg)] rounded p-2">
                      <p className="text-xs text-[var(--color-subtext)]">Compliance</p>
                      <p className={`font-bold ${getScoreColor(rep.avgCompliance)}`}>
                        {rep.avgCompliance || '-'}%
                      </p>
                    </div>
                    <div className="bg-[var(--color-bg)] rounded p-2">
                      <p className="text-xs text-[var(--color-subtext)]">Communication</p>
                      <p className={`font-bold ${getScoreColor(rep.avgCommunication)}`}>
                        {rep.avgCommunication || '-'}%
                      </p>
                    </div>
                    <div className="bg-[var(--color-bg)] rounded p-2">
                      <p className="text-xs text-[var(--color-subtext)]">Empathy</p>
                      <p className={`font-bold ${getScoreColor(rep.avgEmpathy)}`}>
                        {rep.avgEmpathy || '-'}%
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-[var(--color-subtext)]">{rep.highScoreCount} high</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="text-[var(--color-subtext)]">{rep.lowScoreCount} low</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRep(rep.userId);
                        setActiveTab('calls');
                      }}
                    >
                      View Calls
                    </Button>
                  </div>

                  {expandedRep === rep.userId && (
                    <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                      <p className="text-sm text-[var(--color-subtext)] mb-2">Recent Scores</p>
                      <div className="flex gap-1">
                        {rep.recentScores.slice(0, 10).map((score, idx) => (
                          <div
                            key={idx}
                            className="flex-1 h-8 rounded"
                            style={{
                              backgroundColor: score >= 85 ? '#22c55e' : score >= 70 ? '#eab308' : '#ef4444',
                              opacity: 0.3 + (idx / 10) * 0.7,
                            }}
                            title={`Score: ${score}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredRepSummaries.length === 0 && (
            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardContent className="py-12 text-center">
                <User className="h-12 w-12 text-[var(--color-subtext)] mx-auto mb-4" />
                <p className="text-[var(--color-text)]">No rep data available</p>
                <p className="text-sm text-[var(--color-subtext)]">Try adjusting your filters</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* All Audits Tab */}
        <TabsContent value="calls" className="space-y-6 mt-6">
          <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
            <CardHeader>
              <CardTitle className="text-[var(--color-text)]">
                Audit History
                <Badge variant="secondary" className="ml-2">{filteredReportCards.length}</Badge>
              </CardTitle>
              <CardDescription>
                Click on any audit to view the full AI analysis report
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredReportCards.map((rc) => (
                  <div
                    key={rc.id}
                    className="flex items-center gap-4 p-4 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface)] transition-colors"
                    onClick={() => setViewingReportCardId(rc.id)}
                  >
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${rc.overall_score >= 85 ? '#22c55e' : rc.overall_score >= 70 ? '#eab308' : '#ef4444'}20` }}
                    >
                      <span className={`text-lg font-bold ${getScoreColor(rc.overall_score)}`}>
                        {rc.overall_score}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-[var(--color-text)]">
                          {rc.profiles?.first_name} {rc.profiles?.last_name}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          {rc.profiles?.team || 'No Team'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {getScoreLabel(rc.overall_score)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-[var(--color-subtext)]">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(rc.created_at).toLocaleDateString()}
                        </span>
                        {rc.call?.call_duration_seconds && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.floor(rc.call.call_duration_seconds / 60)}m {rc.call.call_duration_seconds % 60}s
                          </span>
                        )}
                        {rc.call?.campaign_name && (
                          <span>{rc.call.campaign_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-subtext)]">
                        {rc.compliance_score !== undefined && (
                          <span>Compliance: <span className={getScoreColor(rc.compliance_score)}>{rc.compliance_score}%</span></span>
                        )}
                        {rc.communication_score !== undefined && (
                          <span>Communication: <span className={getScoreColor(rc.communication_score)}>{rc.communication_score}%</span></span>
                        )}
                        {rc.empathy_score !== undefined && (
                          <span>Empathy: <span className={getScoreColor(rc.empathy_score)}>{rc.empathy_score}%</span></span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {rc.call?.recording_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(rc.call?.recording_url, '_blank');
                          }}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingReportCardId(rc.id);
                        }}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        View Report
                      </Button>
                    </div>
                  </div>
                ))}

                {filteredReportCards.length === 0 && (
                  <div className="text-center py-12">
                    <Phone className="h-12 w-12 text-[var(--color-subtext)] mx-auto mb-4" />
                    <p className="text-[var(--color-text)]">No audits found</p>
                    <p className="text-sm text-[var(--color-subtext)]">Try adjusting your filters</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Report Card Viewer Modal */}
      <ReportCardViewer
        reportCardId={viewingReportCardId || undefined}
        isOpen={!!viewingReportCardId}
        onClose={() => setViewingReportCardId(null)}
      />
    </div>
  );
};

export default AdminReportsPage;
