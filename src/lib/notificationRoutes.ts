/**
 * Maps notification types and metadata to a target route path.
 * Used by toasts, popup notifications, and the notification feed.
 */
export function getNotificationRoute(
  type: string,
  jobId?: string,
  metadata?: any,
  role?: string
): string | null {
  const isOperator = role === "operator";
  const jobLink = jobId ? (isOperator ? `/?job=${jobId}` : `/jobs?job=${jobId}`) : null;

  switch (type) {
    case "new_assignment":
    case "job_deleted":
    case "client_cancellation":
    case "time_edit":
    case "force_clockout":
    case "pending_sign_off":
    case "theyre_here":
    case "mission_accepted":
    case "job_status_change":
      return jobLink ?? (isOperator ? "/" : "/jobs");

    case "broken_gear":
    case "gear_issue":
    case "missing_gear":
      return "/broken";

    case "lost_item":
    case "missing_item_ping":
      return "/missing";

    case "live_note":
    case "chat_message":
      return jobLink ?? (isOperator ? "/" : "/jobs");

    case "client_message":
      return jobId ? `/messages?job=${jobId}` : "/messages";

    case "tardy":
    case "traffic_delay":
      return jobLink ?? (isOperator ? "/" : "/jobs");

    case "change_request":
      return jobLink ?? (isOperator ? "/" : "/jobs");

    case "asset_update":
      return "/assets";

    default:
      return jobLink;
  }
}
