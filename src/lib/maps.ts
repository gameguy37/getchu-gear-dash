// Add GOOGLE_MAPS_API_KEY as a Supabase Edge Function secret in the Supabase dashboard.
// The frontend no longer uses the Google Maps API key directly — it proxies through maps-proxy edge function.

/** Shop HQ address — origin for all operator route calculations */
export const SHOP_ADDRESS = "Promptin' Circumstance HQ, New York, NY 10001";

/** Build a Google Maps directions URL (no API key needed — just a link) */
export function getGoogleMapsDirectionsUrl(destination: string, origin: string = SHOP_ADDRESS) {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
