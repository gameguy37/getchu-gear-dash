import { Badge } from "@/components/ui/badge";
import type { AssetStatus } from "@/lib/types";
import { BLOCKED_ASSET_STATUSES } from "@/lib/types";
import { AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof AlertTriangle | null }> = {
  iffy: { label: "Iffy", className: "bg-warning/20 text-warning border-warning/40", icon: HelpCircle },
  missing: { label: "Missing", className: "bg-destructive/20 text-destructive border-destructive/40", icon: AlertTriangle },
  broken: { label: "Broken", className: "bg-destructive/20 text-destructive border-destructive/40", icon: XCircle },
};

interface AssetStatusBadgeProps {
  status: AssetStatus;
  className?: string;
  size?: "sm" | "default";
}

export function AssetStatusBadge({ status, className, size = "default" }: AssetStatusBadgeProps) {
  if (!BLOCKED_ASSET_STATUSES.includes(status)) return null;

  const config = STATUS_CONFIG[status];
  if (!config) return null;

  const Icon = config.icon;
  const isSmall = size === "sm";

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-bold animate-pulse",
        config.className,
        isSmall ? "text-[9px] px-1.5 py-0 gap-0.5" : "text-xs px-2 py-0.5 gap-1",
        className
      )}
    >
      {Icon && <Icon className={isSmall ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      {config.label}
    </Badge>
  );
}

export function isAssetBlocked(status: AssetStatus): boolean {
  return BLOCKED_ASSET_STATUSES.includes(status);
}
