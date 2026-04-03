import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { useUserRoles } from "./useUserRoles";
import {
  ReportCardsSelectForUser,
  ReportCardsSelectAllWithProfiles,
  ReportCardsTrendData,
  AgentPerformanceSummarySelectForUser,
  type ReportCardWithProfile,
} from "@/services/ReportCardsService";

export const useReportCards = () => {
  const { user } = useAuth();
  const { canManageUsers, userRoles } = useUserRoles();
  const [reportCards, setReportCards] = useState<ReportCardWithProfile[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [performanceSummary, setPerformanceSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReportCards = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let data, fetchError;

      if (canManageUsers()) {
        // Managers see all report cards
        const result = await ReportCardsSelectAllWithProfiles();
        data = result.reportCards;
        fetchError = result.error;
      } else {
        // Employees see only their own
        const result = await ReportCardsSelectForUser(user.id);
        data = result.reportCards;
        fetchError = result.error;
      }

      if (fetchError) {
        // Check if it's a "table doesn't exist" error
        if (fetchError.message?.includes('relation "report_cards" does not exist') ||
            fetchError.message?.includes('does not exist') ||
            fetchError.code === '42P01') {
          console.warn("Report cards table not found. Database migration may not be applied yet.");
          setError("Database tables not found. Please apply the migration (see APPLY_MIGRATION.md)");
          setReportCards([]);
        } else {
          console.error("Error fetching report cards:", fetchError);
          setError(fetchError.message);
        }
      } else {
        setReportCards(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("Failed to load report cards");
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendData = async (userId?: string, days: number = 30) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return;

    try {
      const { trendData: data, error: fetchError } = await ReportCardsTrendData(
        targetUserId,
        days
      );

      if (fetchError) {
        console.error("Error fetching trend data:", fetchError);
      } else {
        setTrendData(data || []);
      }
    } catch (err) {
      console.error("Unexpected error fetching trend data:", err);
    }
  };

  const fetchPerformanceSummary = async (userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return;

    try {
      const { performanceSummary: data, error: fetchError } =
        await AgentPerformanceSummarySelectForUser(targetUserId);

      if (fetchError) {
        // Silently fail if view doesn't exist yet (migration not applied)
        console.warn("Performance summary not available (migration may not be applied):", fetchError);
      } else {
        setPerformanceSummary(data);
      }
    } catch (err) {
      // Silently fail - this is optional data
      console.warn("Performance summary not available:", err);
    }
  };

  useEffect(() => {
    fetchReportCards();
  }, [user?.id, JSON.stringify(userRoles)]);

  return {
    reportCards,
    trendData,
    performanceSummary,
    loading,
    error,
    refetch: fetchReportCards,
    fetchTrendData,
    fetchPerformanceSummary,
  };
};
