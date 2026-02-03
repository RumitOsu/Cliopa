import { useState, useMemo } from "react";
import { format, isToday, isYesterday, isTomorrow, differenceInHours, startOfDay } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useTimeCorrections } from "@/hooks/useTimeCorrections";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface TimeCorrectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  timeEntryId: string;
  originalEndTime: Date;
  originalShiftType: string;
  originalStartTime: Date;
  originalTeam: string;
  onSubmit?: () => void;
}

export const TimeCorrectionDialog = ({
  isOpen,
  onClose,
  timeEntryId,
  originalEndTime,
  originalStartTime,
  originalShiftType,
  originalTeam,
  onSubmit,
}: TimeCorrectionDialogProps) => {
  const [requestedEndTime, setRequestedEndTime] = useState(
    format(originalEndTime, "yyyy-MM-dd'T'HH:mm")
  );
  const [requestedStartTime, setRequestedStartTime] = useState(
    format(originalStartTime, "yyyy-MM-dd'T'HH:mm")
  );

  const [reason, setReason] = useState("");
  const { createTimeCorrection, loading } = useTimeCorrections();
  const [requestedShiftType, setRequestedShiftType] =
    useState<string>(originalShiftType);

  // Check if submission is blocked based on timing rules
  const submissionBlocked = useMemo(() => {
    const now = new Date();
    const shiftDate = startOfDay(originalStartTime);
    const today = startOfDay(now);
    const hoursSinceShift = differenceInHours(now, originalEndTime);

    // Rule: Block if shift is yesterday or tomorrow (but not same day)
    // Exception: Allow if shift is older than 48 hours
    if (isYesterday(shiftDate)) {
      // Yesterday's shift - only block if less than 48 hours ago
      if (hoursSinceShift < 48) {
        return {
          blocked: true,
          message: "Time corrections for yesterday's shifts can only be submitted after 48 hours. Please try again tomorrow.",
        };
      }
    }

    if (isTomorrow(shiftDate)) {
      return {
        blocked: true,
        message: "You cannot submit a time correction for a future shift. Please wait until the shift has occurred.",
      };
    }

    return { blocked: false, message: "" };
  }, [originalStartTime, originalEndTime]);

  const handleSubmit = async () => {
    if (!reason.trim() || !requestedEndTime) return;

    const startTime =
      requestedStartTime !== format(originalStartTime, "yyyy-MM-dd'T'HH:mm")
        ? new Date(requestedStartTime).toISOString()
        : null;
    const endTime =
      requestedEndTime !== format(originalEndTime, "yyyy-MM-dd'T'HH:mm")
        ? new Date(requestedEndTime).toISOString()
        : null;

    const success = await createTimeCorrection(
      timeEntryId,
      startTime,
      endTime,
      reason,
      requestedShiftType,
      originalTeam,
      originalStartTime.toISOString(),
      originalEndTime.toISOString()
    );

    if (success) {
      setReason("");
      onClose();
      if (onSubmit) onSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Time Correction</DialogTitle>
          <DialogDescription>
            Your shift was automatically ended at{" "}
            {format(originalEndTime, "h:mm a")}. If you were still on a call
            with a customer, please request a time correction below.
          </DialogDescription>
        </DialogHeader>

        {submissionBlocked.blocked ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Submission Not Allowed</AlertTitle>
              <AlertDescription>
                {submissionBlocked.message}
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <Label htmlFor="requested-time">Actual Start Time</Label>
                <Input
                  id="requested-start-time"
                  type="datetime-local"
                  value={requestedStartTime}
                  onChange={(e) => setRequestedStartTime(e.target.value)}
                  max={format(originalEndTime, "yyyy-MM-dd'T'HH:mm")}
                />
              </div>

              <div>
                <Label htmlFor="requested-time">Actual End Time</Label>
                <Input
                  id="requested-end-time"
                  type="datetime-local"
                  value={requestedEndTime}
                  onChange={(e) => setRequestedEndTime(e.target.value)}
                  min={format(requestedStartTime, "yyyy-MM-dd'T'HH:mm")}
                />
              </div>

              <div>
                <Label htmlFor="request-type">Actual Shift Type</Label>
                <Select
                  value={requestedShiftType}
                  onValueChange={setRequestedShiftType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular Shift</SelectItem>
                    <SelectItem value="alternate">
                      Alternate Portfolio Shift
                    </SelectItem>
                    <SelectItem value="training">Training Shift</SelectItem>
                    <SelectItem value="bonus">Bonus Shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="reason">Reason for Correction*</Label>
                <Textarea
                  id="reason"
                  placeholder="Please explain why you need this time correction (e.g., 'Was on a customer call that ran over')"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || !reason.trim() || !requestedEndTime}
                className="disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
