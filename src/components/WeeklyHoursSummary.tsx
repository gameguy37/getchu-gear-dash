import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { computeWeeklyHours, formatHours } from "@/lib/hours";
import type { Job, Assignment } from "@/lib/types";
import { startOfWeek, endOfWeek, format } from "date-fns";

interface Props {
  referenceDate: Date;
  assignments: Assignment[];
  jobs: Job[];
  /** When set, scope the tally to a single operator (operator view). */
  operatorId?: string;
  /** When true, render the per-operator breakdown (admin view). */
  showBreakdown?: boolean;
  employees?: Array<{ id: string; name: string }>;
}

export function WeeklyHoursSummary({
  referenceDate,
  assignments,
  jobs,
  operatorId,
  showBreakdown,
  employees = [],
}: Props) {
  const summary = useMemo(
    () => computeWeeklyHours(assignments, jobs, referenceDate, operatorId),
    [assignments, jobs, referenceDate, operatorId],
  );

  const wkStart = startOfWeek(referenceDate);
  const wkEnd = endOfWeek(referenceDate);
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  return (
    <Card className="glass-dark border-primary/10 p-4 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Week of {format(wkStart, "MMM d")} – {format(wkEnd, "MMM d")}
          </p>
          <p className="text-2xl font-bold text-foreground mt-1">
            {formatHours(summary.totalHours)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {operatorId ? "this week" : "team total"}
            </span>
          </p>
        </div>
      </div>

      {showBreakdown && summary.perOperator.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
          {summary.perOperator.map((op) => (
            <div key={op.operatorId} className="flex items-center justify-between text-sm">
              <span className="text-foreground/80 truncate pr-2">
                {empMap.get(op.operatorId) ?? "Unknown"}
              </span>
              <span className="text-foreground font-semibold tabular-nums">
                {formatHours(op.hours)}
              </span>
            </div>
          ))}
        </div>
      )}

      {showBreakdown && summary.perOperator.length === 0 && (
        <p className="mt-3 pt-3 border-t border-border/30 text-sm text-muted-foreground">
          No hours logged this week yet.
        </p>
      )}
    </Card>
  );
}
