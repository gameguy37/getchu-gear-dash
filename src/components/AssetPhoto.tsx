import { useEffect, useState } from "react";
import { getSignedAssetUrl } from "@/lib/assetPhotos";
import { cn } from "@/lib/utils";

interface AssetPhotoProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Stored value: can be a public URL, signed URL, or raw storage path. */
  src: string | null | undefined;
  /** Optional fallback rendered while loading or if signing fails. */
  fallback?: React.ReactNode;
}

/**
 * Image element that resolves a (possibly persisted public) asset-photos URL
 * to a fresh signed URL on mount. Use everywhere the app shows asset photos.
 */
export function AssetPhoto({ src, fallback = null, className, alt = "", ...rest }: AssetPhotoProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    if (!src) return;
    getSignedAssetUrl(src)
      .then((u) => {
        if (!active) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [src]);

  if (!src || failed) return <>{fallback}</>;
  if (!url) {
    return (
      <div className={cn("animate-pulse bg-muted/40", className)} aria-busy="true" />
    );
  }
  return <img src={url} alt={alt} className={className} {...rest} />;
}
