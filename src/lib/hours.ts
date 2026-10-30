import { parseISO, isWithinInterval, startOfWeek, endOfWeek } from "date-fns";
import type { Job, Assignment } from "@/lib/types";

/**
 * Parse "HH:MM" or numeric-string guaranteed_hours into hours (number).
 * Accepts "8", "8.5", "08:30", or "8h 30m" loosely.
 */
function parseGuaranteedHours(val?: string | number | null): number {
  if (val == null) return 0;
  if (typeof val === "number") return isFinite(val) ? val : 0;
  const s = String(val).trim();
  if (!s) return 0;
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return Number(colon[1]) + Number(colon[2]) / 60;
  const num = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isFinite(num) ? num : 0;
}

/** Hours for a single assignment on a given job — actual if clocked-out, else guaranteed. */
export function hoursForAssignment(assignment: Assignment, job?: Job): number {
  if (assignment.actual_start_time && assignment.actual_end_time) {
    const start = new Date(assignment.actual_start_time).getTime();
    const end = new Date(assignment.actual_end_time).getTime();
    if (end > start) return (end - start) / 3_600_000;
  }
  return parseGuaranteedHours(job?.guaranteed_hours);
}

export interface WeeklyOperatorHours {
  operatorId: string;
  hours: number;
}

export interface WeeklyHoursSummary {
  totalHours: number;
  perOperator: WeeklyOperatorHours[];
}

/**
 * Compute weekly hours from assignments + jobs for the week containing `referenceDate`.
 * If `operatorId` is provided, only that operator's hours are counted.
 */
export function computeWeeklyHours(
  assignments: Assignment[],
  jobs: Job[],
  referenceDate: Date,
  operatorId?: string,
): WeeklyHoursSummary {
  const wkStart = startOfWeek(referenceDate);
  const wkEnd = endOfWeek(referenceDate);
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const perOp = new Map<string, number>();
  let total = 0;

  for (const a of assignments) {
    if (operatorId && a.operator_id !== operatorId) continue;
    const job = jobMap.get(a.job_id);
    if (!job?.job_date) continue;
    const d = parseISO(job.job_date);
    if (!isWithinInterval(d, { start: wkStart, end: wkEnd })) continue;
    const h = hoursForAssignment(a, job);
    if (h <= 0) continue;
    total += h;
    perOp.set(a.operator_id, (perOp.get(a.operator_id) ?? 0) + h);
  }

  return {
    totalHours: total,
    perOperator: Array.from(perOp.entries())
      .map(([operatorId, hours]) => ({ operatorId, hours }))
      .sort((a, b) => b.hours - a.hours),
  };
}

export function formatHours(h: number): string {
  if (!h) return "0h";
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 0) return `${whole}h`;
  if (whole === 0) return `${mins}m`;
  return `${whole}h ${mins}m`;
}
