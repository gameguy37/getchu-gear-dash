import { useMemo } from "react";
import type { Asset, Job, Assignment } from "@/lib/types";
import { BLOCKED_ASSET_STATUSES } from "@/lib/types";

/**
 * Determines which assets are *currently* actively checked out right now.
 * An asset is "actively checked out" if it belongs to an assignment where
 * actual_start_time is set and actual_end_time is NOT set.
 */
export function useActivelyCheckedOutAssetIds(
  assignments: Assignment[]
): Set<string> {
  return useMemo(() => {
    const ids = new Set<string>();
    assignments.forEach((a) => {
      if (a.actual_start_time && !a.actual_end_time) {
        (a.asset_ids || []).forEach((id) => ids.add(id));
      }
    });
    return ids;
  }, [assignments]);
}

/**
 * For a given date + time window, returns the set of asset IDs that are
 * unavailable due to overlapping scheduled or active jobs.
 * This checks BOTH the scheduled time windows (call_time + guaranteed_hours)
 * AND actual checkout records (actual_start_time / actual_end_time).
 */
export function useUnavailableAssetIds(
  jobs: Job[],
  assignments: Assignment[],
  targetDate: string | undefined,
  targetCallTime: string,
  targetGuaranteedHours: string
): Set<string> {
  return useMemo(() => {
    if (!targetDate) return new Set<string>();

    const newWindow = getTimeWindow(targetCallTime || "08:00", targetGuaranteedHours || "8");
    const booked = new Set<string>();

    // Get non-cancelled jobs on the same date
    const jobsOnDate = jobs.filter(
      (j) => j.job_date === targetDate && j.status !== "cancelled"
    );
    const jobMap = new Map(jobsOnDate.map((j) => [j.id, j]));

    assignments.forEach((a) => {
      const job = jobMap.get(a.job_id);
      if (!job || !a.asset_ids?.length) return;

      // Check scheduled time window overlap
      const scheduledWindow = getTimeWindow(job.call_time || "08:00", job.guaranteed_hours || "8");
      if (windowsOverlap(newWindow, scheduledWindow)) {
        a.asset_ids.forEach((id) => booked.add(id));
        return;
      }

      // Also check actual clock-in times if they exist
      if (a.actual_start_time) {
        const actualStart = new Date(a.actual_start_time);
        const actualStartDate = actualStart.toISOString().slice(0, 10);
        // Only relevant if actual start is on the same date
        if (actualStartDate === targetDate || job.job_date === targetDate) {
          const actualStartMin = actualStart.getHours() * 60 + actualStart.getMinutes();
          const actualEndMin = a.actual_end_time
            ? new Date(a.actual_end_time).getHours() * 60 + new Date(a.actual_end_time).getMinutes()
            : actualStartMin + 480; // Assume 8h if still active
          const actualWindow = { start: actualStartMin, end: actualEndMin };
          if (windowsOverlap(newWindow, actualWindow)) {
            a.asset_ids.forEach((id) => booked.add(id));
          }
        }
      }
    });

    return booked;
  }, [jobs, assignments, targetDate, targetCallTime, targetGuaranteedHours]);
}

/**
 * Returns the set of asset IDs that are blocked from checkout due to
 * their status being iffy, missing, or broken.
 */
export function useBlockedAssetIds(assets: Asset[]): Set<string> {
  return useMemo(() => {
    const blocked = new Set<string>();
    assets.forEach((a) => {
      if (BLOCKED_ASSET_STATUSES.includes(a.status)) {
        blocked.add(a.id);
      }
    });
    return blocked;
  }, [assets]);
}

function parseTimeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

function getTimeWindow(callTime: string, guaranteedHours: string): { start: number; end: number } {
  const startMin = parseTimeToMinutes(callTime);
  const hours = parseInt(guaranteedHours, 10) || 8;
  return { start: startMin, end: startMin + hours * 60 };
}

function windowsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}
