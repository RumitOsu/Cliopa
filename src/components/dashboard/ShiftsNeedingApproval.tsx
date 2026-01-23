import { History, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useWeeklyHours } from "@/hooks/useWeeklyHours";

export const ShiftsNeedingApprovalTable = () => {
  const { entries, loading, VerifyWeeklyHours } = useWeeklyHours();

  const toggleVerified = (unverified_ids: string[]) => {
    VerifyWeeklyHours(unverified_ids);
  };

  const formatHours = (hours?: number) => {
    if (hours == null) return "–";

    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    return `${h}:${m.toString().padStart(2, "0")}`;
  };

  const formatWeekOf = (iso?: string) => {
    if (!iso) return "–";

    const date = new Date(iso + "T00:00:00"); // avoid TZ issues
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <>
      <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-[var(--color-text)]">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Weekly Hours
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="table-fixed w-full text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[84px] px-2 py-2">Week of</TableHead>
                  <TableHead className="w-[52px] px-2 py-2 text-center">Mon</TableHead>
                  <TableHead className="w-[52px] px-2 py-2 text-center">Tue</TableHead>
                  <TableHead className="w-[52px] px-2 py-2 text-center">Wed</TableHead>
                  <TableHead className="w-[52px] px-2 py-2 text-center">Thu</TableHead>
                  <TableHead className="w-[52px] px-2 py-2 text-center">Fri</TableHead>
                  <TableHead className="w-[52px] px-2 py-2 text-center">Total</TableHead>
                  <TableHead className="text-center min-w-[80px]">
                    Confirm
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries && entries.length > 0 ? entries.slice(0, 5).map((entry) => {
                  // Shows the last 5 weeks
                  return (
                    <TableRow key={entry.week_start_date}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatWeekOf(entry.week_start_date)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center tabular-nums">
                        {formatHours(entry.monday_hours)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center tabular-nums">
                        {formatHours(entry.tuesday_hours)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center tabular-nums">
                        {formatHours(entry.wednesday_hours)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center tabular-nums">
                        {formatHours(entry.thursday_hours)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center tabular-nums">
                        {formatHours(entry.friday_hours)}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {formatHours(entry.total_week_hours)}
                      </TableCell>
                      <TableCell className="text-center">
                        {!entry.has_pending_entries ? (
                          !entry.all_verified ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                toggleVerified(entry.unverified_ids)
                              }
                              aria-label="Verify shift"
                              className="border-[var(--color-border)] hover:bg-green-50 dark:hover:bg-green-950/20"
                            >
                              <span className="text-xs text-[var(--color-text)]">
                                Confirm?
                              </span>
                            </Button>
                          ) : (
                            <div className="flex justify-center">
                              <Check className="h-6 w-6 text-green-600" />
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400">
                            Pending Correction
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }) : null}
                {!loading && (!entries || entries.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-sm text-[var(--color-subtext)] py-8"
                    >
                      No weekly hours recorded yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
};
