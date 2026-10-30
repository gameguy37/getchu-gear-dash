import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "GetchüGear Dispatch <dispatch@promptin.com>";

function esc(s: string | undefined | null): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatDate(d?: string): string {
  if (!d) return "";
  const [y, mo, day] = d.split("-").map(Number);
  if (!y || !mo || !day) return d;
  const dt = new Date(y, mo - 1, day);
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(t?: string): string {
  if (!t) return "TBD";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m || 0).padStart(2, "0")} ${period}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { job_id, operator_id, reason } = await req.json();
    if (!job_id || !operator_id) {
      return new Response(JSON.stringify({ error: "Missing job_id or operator_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch job, operator, assignment + assets in parallel
    const [{ data: job }, { data: operator }, { data: assignment }] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", job_id).maybeSingle(),
      supabase.from("employees").select("id, name, email").eq("id", operator_id).maybeSingle(),
      supabase.from("assignments").select("asset_ids").eq("job_id", job_id).eq("operator_id", operator_id).maybeSingle(),
    ]);

    if (!job) return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: corsHeaders });
    if (!operator?.email) return new Response(JSON.stringify({ error: "Operator email missing" }), { status: 404, headers: corsHeaders });

    // Fetch gear list (assets + their children)
    const assetIds: string[] = assignment?.asset_ids ?? [];
    let assets: { asset_name: string; category?: string }[] = [];
    if (assetIds.length) {
      const { data: parentAssets } = await supabase
        .from("assets")
        .select("id, asset_name, category")
        .in("id", assetIds);
      const { data: childAssets } = await supabase
        .from("assets")
        .select("asset_name, category, parent_asset_id")
        .in("parent_asset_id", assetIds);
      assets = [...(parentAssets ?? []), ...(childAssets ?? [])];
    }

    // Fetch on-site / client contact
    const { data: client } = job.client_name
      ? await supabase.from("clients").select("contact_name, on_site_contact_name, on_site_contact_phone, phone").eq("company_name", job.client_name).maybeSingle()
      : { data: null };

    const mapsUrl = job.address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`
      : null;

    const gearList = assets.length
      ? `<ul style="margin:8px 0 0 0;padding-left:20px;color:#1F2937;font-size:15px;line-height:1.7;">
          ${assets.map((a) => `<li>${esc(a.asset_name)}${a.category ? ` <span style="color:#6B7280;font-size:13px;">(${esc(a.category)})</span>` : ""}</li>`).join("")}
        </ul>`
      : `<p style="color:#6B7280;font-style:italic;margin:8px 0 0 0;">No gear assigned yet.</p>`;

    const contactRow = client?.on_site_contact_name
      ? `<tr><td style="padding:8px 12px;color:#6B7280;font-size:14px;">On-Site Contact</td><td style="padding:8px 12px;color:#111827;font-size:14px;font-weight:600;">${esc(client.on_site_contact_name)}${client.on_site_contact_phone ? ` · ${esc(client.on_site_contact_phone)}` : ""}</td></tr>`
      : "";

    const reasonLabel = reason === "accepted" ? "Mission Accepted — Final Call Sheet" : "New Assignment — Virtual Call Sheet";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <tr><td style="background:#0F172A;padding:24px 28px;">
        <p style="margin:0;color:#94A3B8;font-size:12px;letter-spacing:2px;text-transform:uppercase;">${esc(reasonLabel)}</p>
        <h1 style="margin:8px 0 0 0;color:#FFFFFF;font-size:28px;font-weight:700;letter-spacing:-0.5px;">${formatTime(job.call_time)}</h1>
        <p style="margin:4px 0 0 0;color:#E2E8F0;font-size:18px;font-weight:500;">${esc(job.client_name || job.job_number || "Job")}</p>
        <p style="margin:4px 0 0 0;color:#94A3B8;font-size:14px;">${formatDate(job.job_date)}</p>
      </td></tr>

      <tr><td style="padding:28px;">
        <p style="margin:0 0 20px 0;font-size:15px;color:#374151;">Hey ${esc(operator?.name || "Operator")}, here's your call sheet:</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:8px;margin-bottom:24px;">
          ${job.job_number ? `<tr><td style="padding:8px 12px;color:#6B7280;font-size:14px;">Job #</td><td style="padding:8px 12px;color:#111827;font-size:14px;font-weight:600;">${esc(job.job_number)}</td></tr>` : ""}
          ${job.location_type ? `<tr><td style="padding:8px 12px;color:#6B7280;font-size:14px;">Location Type</td><td style="padding:8px 12px;color:#111827;font-size:14px;font-weight:600;">${esc(job.location_type)}</td></tr>` : ""}
          ${job.guaranteed_hours ? `<tr><td style="padding:8px 12px;color:#6B7280;font-size:14px;">Guaranteed Hours</td><td style="padding:8px 12px;color:#111827;font-size:14px;font-weight:600;">${esc(job.guaranteed_hours)}</td></tr>` : ""}
          ${contactRow}
        </table>

        ${job.address ? `
        <h2 style="margin:0 0 8px 0;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;">📍 Location</h2>
        <p style="margin:0 0 8px 0;font-size:15px;color:#111827;font-weight:500;">${esc(job.address)}</p>
        ${mapsUrl ? `<a href="${esc(mapsUrl)}" style="display:inline-block;background:#2563EB;color:#FFFFFF;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;margin-bottom:24px;">Open in Google Maps →</a>` : ""}
        ` : ""}

        <h2 style="margin:24px 0 0 0;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;">🎒 Gear Load Out (${assets.length})</h2>
        ${gearList}

        ${job.notes ? `
        <h2 style="margin:24px 0 8px 0;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;">📝 Notes</h2>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${esc(job.notes)}</p>
        ` : ""}

        <p style="margin:32px 0 0 0;font-size:13px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:16px;">Be &gt;Words. Have fun out there!</p>
      </td></tr>
    </table>
    <p style="color:#9CA3AF;font-size:12px;margin-top:12px;">© ${new Date().getFullYear()} Promptin' Circumstance / GetchüGear</p>
  </td></tr>
</table></body></html>`;

    if (!RESEND_API_KEY) {
      console.error("[send-call-sheet] RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [operator.email],
        subject: `📋 Call Sheet — ${job.client_name || job.job_number} · ${formatDate(job.job_date)} @ ${formatTime(job.call_time)}`,
        html,
      }),
    });

    const result = await resendRes.json();
    if (!resendRes.ok) {
      console.error("[send-call-sheet] Resend error:", result);
      return new Response(JSON.stringify({ error: "Resend failed", details: result }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-call-sheet] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
