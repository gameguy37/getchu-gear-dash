import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Asset } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a rich display name for an asset.
 * For laptops (assets with macbook_type metadata), shows:
 *   "Walter — M1 MacBook Pro 2023"
 * Falls back to just asset_name.
 */
export function getAssetDisplayName(asset: Asset): string {
  const meta = asset.metadata;
  if (!meta) return asset.asset_name || "Unnamed";
  const model = [meta.macbook_type, meta.year].filter(Boolean).join(" ");
  if (!model) return asset.asset_name || "Unnamed";
  const name = meta.login_name || asset.asset_name;
  return `${name} — ${model}`;
}
