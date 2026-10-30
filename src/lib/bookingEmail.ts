import { toast } from "sonner";

const OPERATOR_BOOKING_COPY = `OooooEee -- you're going to be doing some cool work! Here is the info you need for your job. Have fun and remember to be >Words.`;

const CLIENT_BOOKING_COPY = `Now you've done it! You've gotten Promptin' to join your shoot. Oooeee, good times! Let us know if you need anything changed from here on out. When you're fully booked, please remember you have 24 hours prior to the date of shooting (8am or call time, whichever is earlier) to cancel, otherwise we'll have to charge the full rate!`;

const CANCELLATION_EMAIL_COPY = "You'll get em next time, tiger! Job's canceled for now, but there's another one right around the corner!";

export interface JobEmailDetails {
  jobNumber: string;
  clientName: string;
  jobDate: string;
  callTime?: string;
  arrivalTime?: string;
  locationType?: string;
  address?: string;
  assets?: string[];
}

/**
 * Send booking confirmation email to the assigned operator.
 */
export async function sendOperatorBookingEmail(
  operatorEmail: string,
  operatorName: string,
  jobDetails: JobEmailDetails
) {
  const detailLines = [
    `Client: ${jobDetails.clientName}`,
    `Job #: ${jobDetails.jobNumber}`,
    `Date: ${jobDetails.jobDate}`,
    jobDetails.callTime ? `Call Time: ${jobDetails.callTime}` : null,
    jobDetails.arrivalTime ? `Office Arrival Time: ${jobDetails.arrivalTime}` : null,
    jobDetails.locationType ? `Location: ${jobDetails.locationType}` : null,
    jobDetails.address ? `Address: ${jobDetails.address}` : null,
    jobDetails.assets && jobDetails.assets.length > 0
      ? `Gear Load Out: ${jobDetails.assets.join(", ")}`
      : null,
  ].filter(Boolean).join("\n");

  const payload = {
    to: operatorEmail,
    subject: `You're booked! Job for ${jobDetails.clientName}`,
    body: `Hey ${operatorName},\n\n${OPERATOR_BOOKING_COPY}\n\n${detailLines}`,
  };

  // TODO: Replace with supabase.functions.invoke("send-email", { body: payload })
  if (import.meta.env.DEV) {
    console.log("[OperatorBookingEmail] Payload ready (dev only)");
  }
  void payload;
  toast.success(`Booking email sent to ${operatorName}!`);
}

/**
 * Send booking confirmation email to the client.
 */
export async function sendClientBookingEmail(
  clientEmail: string,
  clientName: string,
  jobDetails: JobEmailDetails
) {
  const detailLines = [
    `Job #: ${jobDetails.jobNumber}`,
    `Date: ${jobDetails.jobDate}`,
    jobDetails.callTime ? `Call Time: ${jobDetails.callTime}` : null,
    jobDetails.locationType ? `Location Type: ${jobDetails.locationType}` : null,
    jobDetails.address ? `Address: ${jobDetails.address}` : null,
    jobDetails.assets && jobDetails.assets.length > 0
      ? `Equipment: ${jobDetails.assets.join(", ")}`
      : null,
  ].filter(Boolean).join("\n");

  const payload = {
    to: clientEmail,
    subject: `Your Promptin' booking is confirmed! (${jobDetails.jobDate})`,
    body: `Hi ${clientName},\n\n${CLIENT_BOOKING_COPY}\n\nHere are your booking details:\n\n${detailLines}`,
  };

  // TODO: Replace with supabase.functions.invoke("send-email", { body: payload })
  if (import.meta.env.DEV) {
    console.log("[ClientBookingEmail] Payload ready (dev only)");
  }
  void payload;
  toast.success(`Confirmation email sent to ${clientName}!`);
}

/**
 * Send cancellation email to the assigned operator.
 */
export async function sendCancellationEmail(
  operatorEmail: string,
  operatorName: string,
  clientName: string
) {
  const payload = {
    to: operatorEmail,
    subject: `Job canceled – ${clientName}`,
    body: `Hey ${operatorName},\n\n${CANCELLATION_EMAIL_COPY}`,
  };

  // TODO: Replace with supabase.functions.invoke("send-email", { body: payload })
  if (import.meta.env.DEV) {
    console.log("[CancellationEmail] Payload ready (dev only)");
  }
  void payload;
  toast.success(`Cancellation email sent to ${operatorName}!`);
}
