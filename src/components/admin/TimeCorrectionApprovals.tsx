import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Clock, User, AlertTriangle, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { format, parseISO } from "date-fns";
import { useTimeCorrections } from "@/hooks/useTimeCorrections";
import { cn } from "@/lib/utils";

interface TimeCorrectionApprovalsProps {
  onBack: () => void;
}

export const TimeCorrectionApprovals = ({
  onBack,
}: TimeCorrectionApprovalsProps) => {
  const [corrections, setCorrections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>(
    {}
  );
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const { fetchPendingCorrections, approveCorrection, denyCorrection } =
    useTimeCorrections();

  // Calculate time difference in minutes for a correction
  const getTimeDeltaMinutes = (correction: any): number => {
    const currentStartTime = new Date(correction.current_start_time);
    const currentEndTime = new Date(correction.current_end_time);
    const requestedStartTime = correction.requested_start_time
      ? new Date(correction.requested_start_time)
      : currentStartTime;
    const requestedEndTime = correction.requested_end_time
      ? new Date(correction.requested_end_time)
      : currentEndTime;

    let diff = 0;
    if (correction.requested_end_time) {
      diff += Math.abs(requestedEndTime.getTime() - currentEndTime.getTime());
    }
    if (correction.requested_start_time) {
      diff += Math.abs(currentStartTime.getTime() - requestedStartTime.getTime());
    }
    return diff / (1000 * 60); // Convert to minutes
  };

  // Check if a correction is "urgent" (over 60 minutes difference)
  const isUrgentCorrection = (correction: any): boolean => {
    if (isManualEntryCorrection(correction)) {
      return getManualEntryDurationMinutes(correction) > 60;
    }
    return getTimeDeltaMinutes(correction) > 60;
  };

  // Treat as "manual entry" when there was no prior shift.
  const isManualEntryCorrection = (correction: any): boolean => {
    const reason = (correction?.reason || "").toString().toLowerCase();
    return reason.includes("manual entry");
  };

  // For manual entries, treat urgency as "how long is the new shift?"
  const getManualEntryDurationMinutes = (correction: any): number => {
    const start =
      correction.requested_start_time ?? correction.current_start_time ?? null;
    const end =
      correction.requested_end_time ?? correction.current_end_time ?? null;

    if (!start || !end) return 0;

    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(0, diffMs / (1000 * 60));
  };

  // Sort and filter corrections - urgent ones first
  const sortedCorrections = useMemo(() => {
    const filtered = showUrgentOnly
      ? corrections.filter(isUrgentCorrection)
      : corrections;

    return [...filtered].sort((a, b) => {
      const aUrgent = isUrgentCorrection(a);
      const bUrgent = isUrgentCorrection(b);
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      // Secondary sort by delta size (larger first)
      return getTimeDeltaMinutes(b) - getTimeDeltaMinutes(a);
    });
  }, [corrections, showUrgentOnly]);

  const urgentCount = useMemo(() =>
    corrections.filter(isUrgentCorrection).length,
    [corrections]
  );

  useEffect(() => {
    loadCorrections();
  }, []);

  const loadCorrections = async () => {
    setLoading(true);
    try {
      console.log("Loading time corrections...");

      const data = await fetchPendingCorrections();
      console.log("fetchPendingCorrections result:", data);
      setCorrections(data);
    } catch (error) {
      console.error("Error loading corrections:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (correctionId: string) => {
    const notes = approvalNotes[correctionId];
    const success = await approveCorrection(correctionId, notes);

    if (success) {
      await loadCorrections(); // Refresh the list
      setApprovalNotes((prev) => ({ ...prev, [correctionId]: "" }));
    }
  };

  const handleDeny = async (correctionId: string) => {
    const notes = approvalNotes[correctionId];
    const success = await denyCorrection(correctionId, notes);

    if (success) {
      await loadCorrections(); // Refresh the list
      setApprovalNotes((prev) => ({ ...prev, [correctionId]: "" }));
    }
  };

  const getEmployeeName = (correction: any) => {
    if (correction.first_name || correction.last_name) {
      return `${correction.first_name || ""} ${
        correction.last_name || ""
      }`.trim();
    }
    return correction.email || "Unknown Employee";
  };

  const calculateManualEntryHours = (
    requestedStart: string | null,
    requestedEnd: string | null
  ) => {
    if (!requestedStart || !requestedEnd) return "----------";

    const start = new Date(requestedStart);
    const end = new Date(requestedEnd);

    const diffMinutes = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = Math.round(diffMinutes % 60);

    if (hours === 0) return `+${minutes} mins`;
    if (hours === 1) return `+${hours} hour ${minutes} mins`;
    return `+${hours} hours ${minutes} mins`;
  };

  const calculateExtraHours = (
    currentStart: string | null,
    currentEnd: string | null,
    requestedStart: string | null,
    requestedEnd: string | null
  ) => {
    const currentStartTime = new Date(currentStart);
    const currentEndTime = new Date(currentEnd);
    const requestedStartTime = new Date(requestedStart);
    const requestedEndTime = new Date(requestedEnd);

    let diff = 0;

    if (requestedEnd) {
      diff += requestedEndTime.getTime() - currentEndTime.getTime();
    }
    if (requestedStart) {
      diff += currentStartTime.getTime() - requestedStartTime.getTime();
    }
    const differenceInSeconds = diff / 1000;
    const differenceInMinutes = differenceInSeconds / 60;
    const absoluteMinutes = Math.abs(differenceInMinutes);
    const hours = Math.floor(absoluteMinutes / 60);
    const minutes = Math.round(absoluteMinutes % 60);
    const sign = differenceInMinutes < 0 ? "-" : "+";

    if (hours === 0) {
      return `${sign}${minutes} mins`;
    } else if (hours === 1) {
      return `${sign}${hours} hour ${minutes} mins`;
    } else {
      return `${sign}${hours} hours ${minutes} mins`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading time corrections...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <h1 className="text-xl font-semibold text-gray-900">
                Time Correction Approvals
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-[var(--color-text)]">
                <Clock className="h-5 w-5" />
                Pending Time Corrections ({corrections.length})
                {urgentCount > 0 && (
                  <Badge variant="destructive" className="ml-2 gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {urgentCount} Urgent
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-[var(--color-subtext)]" />
                <Label htmlFor="urgent-filter" className="text-sm text-[var(--color-subtext)]">
                  Show urgent only
                </Label>
                <Switch
                  id="urgent-filter"
                  checked={showUrgentOnly}
                  onCheckedChange={setShowUrgentOnly}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sortedCorrections.length === 0 ? (
              <div className="text-center py-8 text-[var(--color-subtext)]">
                {showUrgentOnly && corrections.length > 0
                  ? "No urgent corrections - all corrections are within 1 hour"
                  : "No pending time corrections found"}
              </div>
            ) : (
              <div className="space-y-6">
                {sortedCorrections.map((correction) => {
                  const isManual = isManualEntryCorrection(correction);
                  const isUrgent = isUrgentCorrection(correction);
                  return (
                  <div
                    key={correction.id}
                    className={cn(
                      "border rounded-lg p-6 space-y-4 transition-all",
                      isUrgent
                        ? "border-red-500 border-2 bg-red-50 dark:bg-red-950/20"
                        : "border-[var(--color-border)]"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <User className="h-4 w-4 text-[var(--color-subtext)]" />
                          <span className="font-medium text-[var(--color-text)]">
                            {getEmployeeName(correction)}
                          </span>
                          <Badge variant="outline">Time Correction</Badge>
                          {isUrgent && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              URGENT - Over 1 hour change
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">Original Start Time:</span>
                            <p className="text-gray-600">
                              {isManual
                                ? "----------"
                                : format(parseISO(correction.current_start_time), "MMM dd, yyyy 'at' h:mm a")}
                            </p>
                          </div>

                          <div>
                            <span className="font-medium text-gray-700">Original End Time:</span>
                            <p className="text-gray-600">
                              {isManual
                                ? "----------"
                                : format(parseISO(correction.current_end_time), "MMM dd, yyyy 'at' h:mm a")}
                            </p>
                          </div>

                          <div>
                            <span className="font-medium text-gray-700">Original Shift Type:</span>
                            <p className="text-gray-600">
                              {isManual ? "----------" : correction.current_shift_type}
                            </p>
                          </div>

                          <div>
                            <span className="font-medium text-gray-700">
                              Requested Start Time:
                            </span>
                            <p className="text-gray-600">
                              {correction.requested_start_time
                                ? format(
                                    new Date(correction.requested_start_time),
                                    "MMM dd, yyyy 'at' h:mm a"
                                  )
                                : "----------"}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">
                              Requested End Time:
                            </span>
                            <p className="text-gray-600">
                              {correction.requested_end_time
                                ? format(
                                    new Date(correction.requested_end_time),
                                    "MMM dd, yyyy 'at' h:mm a"
                                  )
                                : "----------"}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">
                              Requested Shift Type:
                            </span>
                            <p className="text-gray-600">
                              {correction.requested_shift_type
                                ? correction.requested_shift_type
                                : isManual
                                  ? correction.current_shift_type
                                  : "----------"}
                            </p>
                          </div>
                        </div>

                        <div className="text-sm">
                          <span className="font-medium text-gray-700">
                            Additional Hours:
                          </span>
                          <span className="ml-2 text-blue-600 font-medium">
                            {isManual
                              ? calculateManualEntryHours(
                                  correction.requested_start_time ?? correction.current_start_time,
                                  correction.requested_end_time ?? correction.current_end_time
                                )
                              : calculateExtraHours(
                                  correction.current_start_time,
                                  correction.current_end_time,
                                  correction.requested_start_time,
                                  correction.requested_end_time
                                )}
                          </span>
                        </div>

                        <div className="text-sm">
                          <span className="font-medium text-gray-700">
                            Reason:
                          </span>
                          <p className="mt-1 text-gray-600 bg-gray-50 p-3 rounded">
                            {correction.reason}
                          </p>
                        </div>

                        <div className="text-xs text-gray-500">
                          Submitted{" "}
                          {format(
                            parseISO(correction.created_at),
                            "MMM dd, yyyy 'at' h:mm a"
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`notes-${correction.id}`}>
                            Notes (Optional)
                          </Label>
                          <Textarea
                            id={`notes-${correction.id}`}
                            placeholder="Add any notes about this approval..."
                            value={approvalNotes[correction.id] || ""}
                            onChange={(e) =>
                              setApprovalNotes((prev) => ({
                                ...prev,
                                [correction.id]: e.target.value,
                              }))
                            }
                            rows={2}
                          />
                        </div>
                      </div>

                      <div className="ml-6 flex gap-2">
                        <Button
                          onClick={() => handleApprove(correction.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Approve
                        </Button>
                        <Button
                          onClick={() => handleDeny(correction.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Deny
                        </Button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};
