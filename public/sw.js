// Service Worker for Push Notifications + Installable PWA
// Lightweight: no offline caching (avoids stale-content bugs in Lovable preview).

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// --- Smart routing mirror of src/lib/notificationRoutes.ts ---
function routeFor(type, jobId, metadata, role) {
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
    case "live_note":
    case "chat_message":
    case "tardy":
    case "traffic_delay":
    case "change_request":
      return jobLink || (isOperator ? "/" : "/jobs");
    case "broken_gear":
    case "gear_issue":
    case "missing_gear":
      return "/broken";
    case "lost_item":
    case "missing_item_ping":
      return "/missing";
    case "client_message":
      return jobId ? `/messages?job=${jobId}` : "/messages";
    case "asset_update":
      return "/assets";
    default:
      return jobLink || "/";
  }
}

self.addEventListener("push", (event) => {
  let data = { title: "GetchüGear", body: "You have a new notification" };
  try {
    data = event.data?.json() ?? data;
  } catch {
    try {
      data.body = event.data?.text() || data.body;
    } catch {}
  }

  const type = data.notification_type || data.type;
  const jobId = data.job_id;
  const role = data.role;
  const targetUrl = data.url || routeFor(type, jobId, data.metadata, role);

  const options = {
    body: data.body || data.message || "You have a new notification",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    tag: data.tag || `getchugear-${type || "alert"}-${jobId || Date.now()}`,
    renotify: true,
    requireInteraction: false,
    timestamp: Date.now(),
    data: { ...data, targetUrl },
    actions: [
      { action: "open", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "GetchüGear", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.targetUrl || "/";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Focus existing window and navigate it
      for (const client of allClients) {
        if ("focus" in client) {
          try {
            await client.focus();
            if ("navigate" in client) {
              await client.navigate(targetUrl);
            }
            return;
          } catch {}
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});
