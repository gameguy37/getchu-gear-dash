import { supabase } from "@/integrations/supabase/client";

const BUCKET = "asset-photos";

/**
 * Upload a raw File to the 'asset-photos' bucket using a unique UUID filename
 * so uploads never overwrite each other. Returns the STORAGE PATH which is
 * what must be persisted to the database (never a blob: URL).
 */
export async function uploadAssetPhoto(
  assetId: string,
  file: File,
  labelPrefix?: string
): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const prefix = labelPrefix ? `${labelPrefix.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-` : "";
  const path = `${assetId}/${prefix}${uuid}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Public URL for a stored asset-photos path (or already-stored URL). */
export function getAssetPublicUrl(input: string | null | undefined): string | null {
  const path = extractAssetPath(input);
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// In-memory cache: storage path -> { url, expires (ms) }
const cache = new Map<string, { url: string; expires: number }>();
const SIGN_TTL_SECONDS = 3600; // 1 hour
const REFRESH_BEFORE_MS = 60_000; // refresh 1 min before expiry

/**
 * Extract the storage path from either a stored public URL
 * (https://<proj>.supabase.co/storage/v1/object/public/asset-photos/<path>)
 * or a stored signed URL, or a raw path.
 */
export function extractAssetPath(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // Already a raw path (no protocol)
  if (!s.startsWith("http")) return s.replace(/^\/+/, "");

  // Match /asset-photos/<rest> in the URL
  const m = s.match(/\/asset-photos\/([^?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

/**
 * Get a fresh signed URL for an asset photo. Caches results in-memory
 * for the duration of the signed URL TTL.
 */
export async function getSignedAssetUrl(
  input: string | null | undefined
): Promise<string | null> {
  const path = extractAssetPath(input);
  if (!path) return null;

  const cached = cache.get(path);
  const now = Date.now();
  if (cached && cached.expires - REFRESH_BEFORE_MS > now) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGN_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    // Fall back to the bucket's public URL so images never render broken
    // (covers cases where signing is denied but the object is public).
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (pub?.publicUrl) {
      cache.set(path, { url: pub.publicUrl, expires: now + SIGN_TTL_SECONDS * 1000 });
      return pub.publicUrl;
    }
    return null;
  }

  cache.set(path, {
    url: data.signedUrl,
    expires: now + SIGN_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

/**
 * Bulk version – returns a map of input -> signed url.
 */
export async function getSignedAssetUrls(
  inputs: (string | null | undefined)[]
): Promise<Record<string, string>> {
  const unique = Array.from(
    new Set(inputs.map((i) => extractAssetPath(i)).filter((p): p is string => !!p))
  );
  const result: Record<string, string> = {};
  await Promise.all(
    unique.map(async (path) => {
      const url = await getSignedAssetUrl(path);
      if (url) result[path] = url;
    })
  );
  // Map back from original input strings to signed urls
  const byInput: Record<string, string> = {};
  for (const input of inputs) {
    const path = extractAssetPath(input);
    if (path && result[path] && input) byInput[input] = result[path];
  }
  return byInput;
}
