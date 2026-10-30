/** Haversine distance between two lat/lng points, returned in miles. */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface Coords { lat: number; lng: number }

/** Build a Google Maps URL from coordinates. */
export function buildMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Best-effort capture of the operator's current location as a Google Maps URL.
 * Returns null if permission denied, unsupported, or times out.
 */
export async function tryGetCurrentMapsUrl(timeoutMs = 8000): Promise<string | null> {
  try {
    const { lat, lng } = await getCurrentCoords(timeoutMs);
    return buildMapsUrl(lat, lng);
  } catch {
    return null;
  }
}

/** Promise wrapper around navigator.geolocation.getCurrentPosition */
export function getCurrentCoords(timeoutMs = 10000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported in this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

/**
 * Geocode an address to lat/lng using the maps-proxy edge function.
 * Returns null if not found.
 */
export async function geocodeAddress(address: string): Promise<Coords | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke("maps-proxy", {
      body: { action: "geocode", address },
    });
    if (error || !data) return null;
    if (data.lat != null && data.lng != null) return { lat: data.lat, lng: data.lng };
    return null;
  } catch {
    return null;
  }
}
