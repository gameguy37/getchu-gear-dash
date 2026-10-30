import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "GetchüGear Dispatch <dispatch@promptin.com>";

// HTML escape helper — prevents injection from user-supplied data
function esc(s: string | undefined | null): string {
  return (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

interface EmailRequest {
  type: "operator" | "client" | "cancellation" | "operator_update" | "client_update" | "en_route" | "theyre_here" | "job_status_change" | "gear_issue" | "change_request" | "lost_item" | "missing_item_ping" | "force_clockout" | "relay_message";
  to: string;
  recipientName: string;
  jobDetails: {
    jobNumber: string;
    clientName: string;
    jobDate: string;
    callTime?: string;
    arrivalTime?: string;
    locationType?: string;
    address?: string;
    guaranteedHours?: string;
    assets?: string[];
    jobUrl?: string;
    statusLabel?: string;
    assetName?: string;
    condition?: string;
    operatorName?: string;
    notes?: string;
    itemName?: string;
    quantity?: number;
    parentRigName?: string;
    portalToken?: string;
    siteUrl?: string;
  };
}

const CYAN = "#00E5FF";
const UPDATE_ACCENT = "#FFB300";
const EN_ROUTE_ACCENT = "#76FF03";
const BG = "#121212";
const CARD_BG = "#1E1E1E";
const DETAIL_BG = "#2A2A2A";
const WHITE = "#FFFFFF";
const GREY = "#B0B0B0";
const WARN_BORDER = "#FF6F00";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatDateAmerican(dateStr: string): string {
  if (!dateStr) return "";
  const [y, mo, d] = dateStr.split("-").map(Number);
  if (!y || !mo || !d) return dateStr;
  const date = new Date(y, mo - 1, d);
  return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${d}, ${y}`;
}

function formatCallTimeAMPM(callTime?: string): string {
  if (!callTime) return "";
  const [h, m] = callTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return callTime;
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

function replyLink(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
    <tr><td style="text-align:center;">
      <a href="mailto:info@promptin.com" style="color:${CYAN};font-size:14px;text-decoration:underline;">Need to change something? Email us!</a>
    </td></tr>
  </table>`;
}

function wrap(inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${BG};font-family:Helvetica,Arial,sans-serif;color:${WHITE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${CARD_BG};border:1px solid #333;border-radius:12px;overflow:hidden;">
<tr><td style="padding:32px 28px;">${inner}</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin-top:16px;">
<tr><td style="text-align:center;color:#666;font-size:12px;padding:8px;">© ${new Date().getFullYear()} Promptin' Circumstance / GetchüGear</td></tr>
</table>
</td></tr></table></body></html>`;
}

function buildOperatorEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const rows = [
    d.clientName ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Client</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.clientName)}</td></tr>` : "",
    d.jobNumber ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Job #</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.jobNumber)}</td></tr>` : "",
    d.jobDate ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Date</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatDateAmerican(d.jobDate)}</td></tr>` : "",
    d.callTime ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Call Time</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatCallTimeAMPM(d.callTime)}</td></tr>` : "",
    d.arrivalTime ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Office Arrival</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.arrivalTime)}</td></tr>` : "",
    d.address ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Address</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.address)}</td></tr>` : "",
    d.guaranteedHours ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Guaranteed Hours</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.guaranteedHours)}</td></tr>` : "",
    d.assets?.length ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Gear Load Out</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${d.assets.map(esc).join(", ")}</td></tr>` : "",
  ].filter(Boolean).join("");

  const button = d.jobUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td>
        <a href="${esc(d.jobUrl)}" style="display:block;background-color:${CYAN};color:${BG};text-align:center;padding:16px 24px;border-radius:8px;font-size:16px;font-weight:bold;text-decoration:none;letter-spacing:1px;">ACCESS MISSION DASHBOARD</a>
      </td></tr></table>` : "";

  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${CYAN};letter-spacing:2px;">GETCHÜGEAR // NEW ASSIGNMENT</h1>
    <div style="width:60px;height:3px;background:${CYAN};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hey ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">OooooEee -- you're going to be doing some cool work! Here is the info you need for your job:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:8px;">
      ${rows}
    </table>
    ${button}
    <p style="font-size:14px;line-height:1.6;color:${GREY};margin:24px 0 0 0;">Have fun and remember to be &gt;Words.</p>
    ${replyLink()}`;

  return { subject: "New GetchüGear Assignment!", html: wrap(inner) };
}

function buildClientEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const rows = [
    d.jobNumber ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Job #</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.jobNumber)}</td></tr>` : "",
    d.jobDate ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Date</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatDateAmerican(d.jobDate)}</td></tr>` : "",
    d.callTime ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Call Time</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatCallTimeAMPM(d.callTime)}</td></tr>` : "",
    d.address ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Address</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.address)}</td></tr>` : "",
    d.assets?.length ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Equipment</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${d.assets.map(esc).join(", ")}</td></tr>` : "",
  ].filter(Boolean).join("");

  const portalButton = d.portalToken && d.siteUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;margin-bottom:20px;"><tr><td>
        <a href="${esc(d.siteUrl)}/portal/${esc(d.portalToken)}" style="display:block;background-color:${CYAN};color:${BG};text-align:center;padding:16px 24px;border-radius:8px;font-size:16px;font-weight:bold;text-decoration:none;letter-spacing:1px;">VIEW YOUR BOOKING</a>
      </td></tr></table>` : "";

  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${CYAN};letter-spacing:2px;">PROMPTIN' CIRCUMSTANCE // BOOKING COMING IN HOT!</h1>
    <div style="width:60px;height:3px;background:${CYAN};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hi ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Now you've done it! You've gotten Promptin' to join your shoot. Oooeee, good times! Let us know if you need anything changed from here on out.</p>
    <p style="font-size:14px;color:${GREY};margin:0 0 16px 0;">Here are your booking details:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:20px;">
      ${rows}
    </table>
    ${portalButton}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${WARN_BORDER};border-radius:8px;overflow:hidden;">
      <tr><td style="padding:16px;background-color:rgba(255,111,0,0.08);">
        <p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:${WARN_BORDER};letter-spacing:1px;">⚠ CANCELLATION POLICY</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:${WHITE};">When you're fully booked, please remember you have <strong>24 hours</strong> prior to the date of shooting (8 AM or call time, whichever is earlier) to cancel, otherwise we'll have to charge the full rate!</p>
      </td></tr>
    </table>
    ${replyLink()}`;

  return { subject: `Your Promptin' booking is confirmed! (${formatDateAmerican(d.jobDate)})`, html: wrap(inner) };
}

function buildOperatorUpdateEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const rows = [
    d.clientName ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Client</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.clientName)}</td></tr>` : "",
    d.jobNumber ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Job #</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.jobNumber)}</td></tr>` : "",
    d.jobDate ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Date</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatDateAmerican(d.jobDate)}</td></tr>` : "",
    d.callTime ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Call Time</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatCallTimeAMPM(d.callTime)}</td></tr>` : "",
    d.arrivalTime ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Office Arrival</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.arrivalTime)}</td></tr>` : "",
    d.address ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Address</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.address)}</td></tr>` : "",
    d.guaranteedHours ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Guaranteed Hours</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.guaranteedHours)}</td></tr>` : "",
    d.assets?.length ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Gear Load Out</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${d.assets.map(esc).join(", ")}</td></tr>` : "",
  ].filter(Boolean).join("");

  const button = d.jobUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td>
        <a href="${esc(d.jobUrl)}" style="display:block;background-color:${UPDATE_ACCENT};color:${BG};text-align:center;padding:16px 24px;border-radius:8px;font-size:16px;font-weight:bold;text-decoration:none;letter-spacing:1px;">REVIEW UPDATED MISSION DASHBOARD</a>
      </td></tr></table>` : "";

  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${UPDATE_ACCENT};letter-spacing:2px;">GETCHÜGEAR // MISSION UPDATE</h1>
    <div style="width:60px;height:3px;background:${UPDATE_ACCENT};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hey ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Heads up! The intel for your upcoming shoot has changed. Please review the updated details below.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:8px;">
      ${rows}
    </table>
    ${button}
    <p style="font-size:14px;line-height:1.6;color:${GREY};margin:24px 0 0 0;">Have fun and remember to be &gt;Words.</p>
    ${replyLink()}`;

  return { subject: "Mission Update – Your GetchüGear Assignment Changed!", html: wrap(inner) };
}

function buildClientUpdateEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const rows = [
    d.jobNumber ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Job #</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.jobNumber)}</td></tr>` : "",
    d.jobDate ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Date</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatDateAmerican(d.jobDate)}</td></tr>` : "",
    d.callTime ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Call Time</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatCallTimeAMPM(d.callTime)}</td></tr>` : "",
    d.address ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Address</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.address)}</td></tr>` : "",
    d.assets?.length ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Equipment</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${d.assets.map(esc).join(", ")}</td></tr>` : "",
  ].filter(Boolean).join("");

  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${UPDATE_ACCENT};letter-spacing:2px;">PROMPTIN' CIRCUMSTANCE // UPDATE TO YOUR BOOKING</h1>
    <div style="width:60px;height:3px;background:${UPDATE_ACCENT};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hi ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Looks like some details have shifted for our upcoming shoot! Here is the latest info we have on file. If anything else needs tweaking, just let us know.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:20px;">
      ${rows}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${WARN_BORDER};border-radius:8px;overflow:hidden;">
      <tr><td style="padding:16px;background-color:rgba(255,111,0,0.08);">
        <p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:${WARN_BORDER};letter-spacing:1px;">⚠ CANCELLATION POLICY</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:${WHITE};">When you're fully booked, please remember you have <strong>24 hours</strong> prior to the date of shooting (8 AM or call time, whichever is earlier) to cancel, otherwise we'll have to charge the full rate!</p>
      </td></tr>
    </table>
    ${replyLink()}`;

  return { subject: `Booking Update – Your Promptin' shoot details changed (${formatDateAmerican(d.jobDate)})`, html: wrap(inner) };
}

function buildEnRouteEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const rows = [
    d.jobDate ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Date</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatDateAmerican(d.jobDate)}</td></tr>` : "",
    d.callTime ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Call Time</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatCallTimeAMPM(d.callTime)}</td></tr>` : "",
    d.address ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Address</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.address)}</td></tr>` : "",
  ].filter(Boolean).join("");

  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${EN_ROUTE_ACCENT};letter-spacing:2px;">PROMPTIN' // EN ROUTE 🚗</h1>
    <div style="width:60px;height:3px;background:${EN_ROUTE_ACCENT};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hi ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Our team is on the way to make your day fly by! We'll be there before you know it.</p>
    ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:20px;">${rows}</table>` : ""}
    <p style="font-size:14px;line-height:1.6;color:${GREY};margin:0;">See you soon!</p>
    ${replyLink()}`;

  return { subject: "Promptin' En Route to make your day fly by! 🚗", html: wrap(inner) };
}

function buildTheyreHereEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const PINK = "#FF69B4";
  const rows = [
    d.jobDate ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Date</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatDateAmerican(d.jobDate)}</td></tr>` : "",
    d.callTime ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Call Time</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatCallTimeAMPM(d.callTime)}</td></tr>` : "",
    d.operatorName ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Operator</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.operatorName)}</td></tr>` : "",
  ].filter(Boolean).join("");

  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${PINK};letter-spacing:2px;">PROMPTIN' // THEY'RE HEEEEeeerre! 🎉</h1>
    <div style="width:60px;height:3px;background:${PINK};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hi ${esc(name)},</p>
    <p style="font-size:24px;line-height:1.4;color:${WHITE};margin:0 0 20px 0;text-align:center;">🎬 Your crew has arrived! 🎬</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Our team just clocked in and is ready to make some magic happen. Let's gooooo! 🚀</p>
    ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:20px;">${rows}</table>` : ""}
    <p style="font-size:14px;line-height:1.6;color:${GREY};margin:0;">It's showtime! 🍿</p>
    ${replyLink()}`;

  return { subject: "They're HEEEEeeerre! 🎉 Your Promptin' crew has arrived!", html: wrap(inner) };
}

function buildCancellationEmail(name: string): { subject: string; html: string } {
  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:#FF5252;letter-spacing:2px;">GETCHÜGEAR // JOB CANCELLED</h1>
    <div style="width:60px;height:3px;background:#FF5252;border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hey ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">You'll get em next time, tiger! Job's canceled for now — keep your eyes peeled for new assignments.</p>
    <p style="font-size:14px;line-height:1.6;color:${GREY};margin:24px 0 0 0;">Stay sharp & be &gt;Words.</p>
    ${replyLink()}`;

  return { subject: "Job Cancelled – GetchüGear", html: wrap(inner) };
}

function buildJobStatusChangeEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${UPDATE_ACCENT};letter-spacing:2px;">GETCHÜGEAR // JOB STATUS UPDATE</h1>
    <div style="width:60px;height:3px;background:${UPDATE_ACCENT};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hey ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Your job <strong>${esc(d.jobNumber)}</strong> has moved to <strong>${esc(d.statusLabel || "a new status")}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:8px;">
      ${d.clientName ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Client</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.clientName)}</td></tr>` : ""}
      ${d.jobDate ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Date</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatDateAmerican(d.jobDate)}</td></tr>` : ""}
    </table>
    <p style="font-size:14px;line-height:1.6;color:${GREY};margin:24px 0 0 0;">Stay sharp & be &gt;Words.</p>
    ${replyLink()}`;
  return { subject: `Job Status Update – ${esc(d.jobNumber)}`, html: wrap(inner) };
}

function buildGearIssueEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const RED = "#FF5252";
  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${RED};letter-spacing:2px;">⚠ GEAR ISSUE REPORTED</h1>
    <div style="width:60px;height:3px;background:${RED};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hi ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">A gear issue has been reported that needs your attention.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:8px;">
      <tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Asset</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.assetName)}</td></tr>
      <tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Condition</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.condition)}</td></tr>
      ${d.operatorName ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Reported By</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.operatorName)}</td></tr>` : ""}
    </table>
    ${replyLink()}`;
  return { subject: `⚠ Gear Issue Reported – ${esc(d.assetName || "Unknown Asset")}`, html: wrap(inner) };
}

function buildChangeRequestEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${CYAN};letter-spacing:2px;">📋 CLIENT CHANGE REQUEST</h1>
    <div style="width:60px;height:3px;background:${CYAN};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hi ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">A client has submitted a change request for job <strong>${esc(d.jobNumber)}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:8px;">
      <tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Client</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.clientName)}</td></tr>
      <tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Notes</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.notes || "No details provided")}</td></tr>
    </table>
    ${replyLink()}`;
  return { subject: `📋 Client Change Request – ${esc(d.jobNumber)}`, html: wrap(inner) };
}

function buildLostItemEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const ORANGE = "#FF9800";
  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${ORANGE};letter-spacing:2px;">📦 LOST ITEM REPORTED</h1>
    <div style="width:60px;height:3px;background:${ORANGE};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hi ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">A lost item has been reported and needs your attention.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:8px;">
      <tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Item</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.itemName)}</td></tr>
      <tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Quantity</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${d.quantity ?? 1}</td></tr>
      ${d.jobNumber ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Job</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.jobNumber)}</td></tr>` : ""}
      ${d.operatorName ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Reported By</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.operatorName)}</td></tr>` : ""}
    </table>
    ${replyLink()}`;
  return { subject: `📦 Lost Item Reported – ${esc(d.itemName || "Unknown")}`, html: wrap(inner) };
}

function buildMissingItemPingEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const AMBER = "#FFB300";
  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${AMBER};letter-spacing:2px;">🔍 QUICK QUESTION ABOUT SOME GEAR</h1>
    <div style="width:60px;height:3px;background:${AMBER};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hey ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">We noticed <strong>${d.quantity ?? 1}x ${esc(d.itemName)}</strong> didn't make it back with the <strong>${esc(d.parentRigName)}</strong> kit after your last job. Have you seen it by any chance? No stress if not — just tracking it down. Let us know!</p>
    ${replyLink()}`;
  return { subject: "Quick question about some missing gear 🔍", html: wrap(inner) };
}


function buildForceClockoutEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const AMBER = "#FFB300";
  const rows = [
    d.jobNumber ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Job #</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.jobNumber)}</td></tr>` : "",
    d.clientName ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Client</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${esc(d.clientName)}</td></tr>` : "",
    d.jobDate ? `<tr><td style="color:${GREY};padding:6px 12px;font-size:14px;">Date</td><td style="color:${WHITE};padding:6px 12px;font-size:14px;font-weight:bold;">${formatDateAmerican(d.jobDate)}</td></tr>` : "",
  ].filter(Boolean).join("");

  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${AMBER};letter-spacing:2px;">GETCHÜGEAR // FORGOT SOMETHING?</h1>
    <div style="width:60px;height:3px;background:${AMBER};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hey ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Looks like you forgot to check yourself out (and/or your gear) on your last job. No worries — we've got you covered this time! But please remember: the only way we can track where our equipment is, is by you completing the checkout/check-in process. Let's leave it a little better for the next person! 🙏</p>
    ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DETAIL_BG};border-radius:8px;overflow:hidden;margin-bottom:8px;">${rows}</table>` : ""}
    ${replyLink()}`;

  return { subject: `Heads up — you were clocked out on job ${esc(d.jobNumber)} 👋`, html: wrap(inner) };
}

function buildRelayMessageEmail(name: string, d: EmailRequest["jobDetails"]): { subject: string; html: string } {
  const BLUE = "#3b82f6";
  const inner = `
    <h1 style="margin:0 0 4px 0;font-size:22px;color:${BLUE};letter-spacing:2px;">PROMPTIN' // MESSAGE FROM YOUR CREW 💬</h1>
    <div style="width:60px;height:3px;background:${BLUE};border-radius:2px;margin-bottom:20px;"></div>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">Hi ${esc(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:${WHITE};margin:0 0 20px 0;">You have a new message from your team on job <strong>${esc(d.jobNumber)}</strong>:</p>
    <div style="background-color:${DETAIL_BG};border-radius:8px;padding:16px;margin-bottom:20px;border-left:4px solid ${BLUE};">
      <p style="font-size:14px;line-height:1.6;color:${WHITE};margin:0;">${esc(d.notes)}</p>
      ${d.operatorName ? `<p style="font-size:12px;color:${GREY};margin:8px 0 0 0;">— ${esc(d.operatorName)}</p>` : ""}
    </div>
    ${replyLink()}`;

  return { subject: `New message from your crew on job ${esc(d.jobNumber)} 💬`, html: wrap(inner) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth check ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // --- Role check ---
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: empData } = await adminClient
    .from("employees")
    .select("role")
    .eq("user_id", claimsData.claims.sub)
    .single();
  const callerRole = (empData?.role ?? "").toLowerCase();

  // Operators may send specific email types (en_route, theyre_here, missing_item_ping)
  const OPERATOR_ALLOWED_TYPES = ["en_route", "theyre_here", "missing_item_ping", "relay_message"];
  if (!["admin", "manager"].includes(callerRole)) {
    // For operators, peek at the email types to decide
    if (callerRole !== "operator") {
      return new Response(JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Will validate individual email types below
  }

  try {
    const { emails } = await req.json() as { emails: EmailRequest[] };

    if (!emails?.length) {
      return new Response(JSON.stringify({ error: "No emails provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // For operators, build the set of recipient addresses they are allowed to email:
    // every employee address (dispatch/admins/managers/fellow crew) plus the client
    // contact addresses on jobs they are actually assigned to.
    let allowedRecipients: Set<string> | null = null;
    if (callerRole === "operator") {
      allowedRecipients = new Set<string>();

      const { data: myEmp } = await adminClient
        .from("employees")
        .select("id")
        .eq("user_id", claimsData.claims.sub)
        .maybeSingle();

      const { data: staff } = await adminClient.from("employees").select("email");
      for (const s of staff ?? []) {
        if (s?.email) allowedRecipients.add(String(s.email).trim().toLowerCase());
      }

      if (myEmp?.id) {
        const { data: myAssignments } = await adminClient
          .from("assignments")
          .select("job_id")
          .eq("operator_id", myEmp.id);
        const jobIds = (myAssignments ?? []).map((a: any) => a.job_id).filter(Boolean);

        if (jobIds.length) {
          const { data: myJobs } = await adminClient
            .from("jobs")
            .select("client_name")
            .in("id", jobIds);
          const clientNames = Array.from(
            new Set((myJobs ?? []).map((j: any) => j.client_name).filter(Boolean))
          );
          if (clientNames.length) {
            const { data: clients } = await adminClient
              .from("clients")
              .select("email, on_site_contact")
              .in("company_name", clientNames);
            for (const c of clients ?? []) {
              if (c?.email) allowedRecipients.add(String(c.email).trim().toLowerCase());
              const onSite = String(c?.on_site_contact ?? "").trim().toLowerCase();
              if (onSite.includes("@")) allowedRecipients.add(onSite);
            }
          }
        }
      }
    }

    const results = [];

    for (const email of emails) {
      // Operators can only send allowed types
      if (callerRole === "operator" && !OPERATOR_ALLOWED_TYPES.includes(email.type)) {
        results.push({ to: email.to, error: "Forbidden email type for operator" });
        continue;
      }

      // Operators can only send to recipients that exist in our database
      if (allowedRecipients) {
        const target = String(email.to ?? "").trim().toLowerCase();
        if (!target || !allowedRecipients.has(target)) {
          console.warn(`[send-job-emails] Operator attempted unauthorized recipient: ${target}`);
          results.push({ to: email.to, error: "Forbidden recipient", status: "blocked" });
          continue;
        }
      }


      let content: { subject: string; html: string };

      switch (email.type) {
        case "operator":
          content = buildOperatorEmail(email.recipientName, email.jobDetails);
          break;
        case "client":
          content = buildClientEmail(email.recipientName, email.jobDetails);
          break;
        case "cancellation":
          content = buildCancellationEmail(email.recipientName);
          break;
        case "operator_update":
          content = buildOperatorUpdateEmail(email.recipientName, email.jobDetails);
          break;
        case "client_update":
          content = buildClientUpdateEmail(email.recipientName, email.jobDetails);
          break;
        case "en_route":
          content = buildEnRouteEmail(email.recipientName, email.jobDetails);
          break;
        case "theyre_here":
          content = buildTheyreHereEmail(email.recipientName, email.jobDetails);
          break;
        case "job_status_change":
          content = buildJobStatusChangeEmail(email.recipientName, email.jobDetails);
          break;
        case "gear_issue":
          content = buildGearIssueEmail(email.recipientName, email.jobDetails);
          break;
        case "change_request":
          content = buildChangeRequestEmail(email.recipientName, email.jobDetails);
          break;
        case "lost_item":
          content = buildLostItemEmail(email.recipientName, email.jobDetails);
          break;
        case "missing_item_ping":
          content = buildMissingItemPingEmail(email.recipientName, email.jobDetails);
          break;
        case "force_clockout":
          content = buildForceClockoutEmail(email.recipientName, email.jobDetails);
          break;
        case "relay_message":
          content = buildRelayMessageEmail(email.recipientName, email.jobDetails);
          break;
        default:
          results.push({ to: email.to, error: "Unknown email type" });
          continue;
      }

      if (RESEND_API_KEY) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_EMAIL, to: [email.to], subject: content.subject, html: content.html }),
        });
        const body = await res.text();
        results.push({ to: email.to, status: res.ok ? "sent" : "failed", detail: body });
      } else {
        console.log(`[send-job-emails] No RESEND_API_KEY. Would send to ${email.to}: ${content.subject}`);
        results.push({ to: email.to, status: "skipped", reason: "no_api_key" });
      }
    }

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
