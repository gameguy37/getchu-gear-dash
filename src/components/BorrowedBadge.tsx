import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BorrowedBadgeProps {
  asset: { original_parent_id?: string; home_parent_id?: string; is_borrowed?: boolean };
  children?: ReactNode;
  className?: string;
  /** Called with the home kit id when clicked. Omit to render a static badge. */
  onOpen?: (homeKitId: string) => void;
}

const BASE = "rounded-full border-warning/40 bg-warning/15 font-bold text-warning";
const INTERACTIVE =
  "cursor-pointer transition-all hover:bg-warning/25 hover:shadow-[0_0_14px_hsl(var(--warning)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50";

/**
 * Amber "⚠ Borrowed" badge. When `onOpen` is provided (and the item has a home
 * kit), it becomes a clickable control that jumps to the kit it was borrowed from.
 */
export function BorrowedBadge({ asset, children, className, onOpen }: BorrowedBadgeProps) {
  const homeKitId = asset.original_parent_id ?? asset.home_parent_id;

  const open = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onOpen && homeKitId) onOpen(homeKitId);
  };

  if (!onOpen || !homeKitId) {
    return (
      <Badge variant="outline" className={cn(BASE, className)}>
        {children ?? "⚠ Borrowed"}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      role="button"
      tabIndex={0}
      title="Click to view original kit"
      className={cn(BASE, INTERACTIVE, className)}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") open(e);
      }}
    >
      {children ?? "⚠ Borrowed"}
    </Badge>
  );
}
