import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Wrench, Package } from "lucide-react";
import { useUpdateAssetStatus } from "@/hooks/useSupabaseData";
import { toast } from "sonner";
import { cn, getAssetDisplayName } from "@/lib/utils";
import type { Asset } from "@/lib/types";

interface PrepQuickResolveDialogProps {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
  onResolved: (assetId: string) => void;
}

export function PrepQuickResolveDialog({ asset, open, onClose, onResolved }: PrepQuickResolveDialogProps) {
  const updateAssetStatus = useUpdateAssetStatus();
  const [notes, setNotes] = useState("");
  const [resolving, setResolving] = useState(false);

  if (!asset) return null;

  const displayName = asset.metadata?.macbook_type ? getAssetDisplayName(asset) : asset.asset_name;
  const status = asset.status ?? "unknown";
  const isMissing = status === "missing";
  const isBroken = status === "broken";
  const isIffy = status === "iffy";

  const handleResolve = async () => {
    setResolving(true);
    try {
      await updateAssetStatus.mutateAsync({ id: asset.id, status: "available" });
      toast.success(`✅ ${displayName} marked as available!`);
      onResolved(asset.id);
      setNotes("");
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update status.");
    } finally {
      setResolving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm glass-dark border-primary/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground text-base">
            {isMissing ? <Package className="h-5 w-5 text-warning" /> :
             isBroken ? <Wrench className="h-5 w-5 text-destructive" /> :
             <Wrench className="h-5 w-5 text-amber-500" />}
            Quick Resolve
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              {asset.color_code && (
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: asset.color_code }} />
              )}
              <span className="text-sm font-bold text-foreground flex-1">{displayName}</span>
              <Badge className={cn(
                "text-[10px] font-black uppercase",
                isBroken ? "bg-destructive/20 text-destructive border-destructive/30" :
                isMissing ? "bg-warning/20 text-warning border-warning/30" :
                isIffy ? "bg-amber-500/20 text-amber-500 border-amber-500/30" :
                "bg-muted/20 text-muted-foreground border-muted/30"
              )}>
                {status}
              </Badge>
            </div>

            {asset.damage_notes && (
              <p className="text-xs text-muted-foreground italic">📝 {asset.damage_notes}</p>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            {isMissing
              ? "Found this item? Mark it as available so it can be used for this job."
              : "Fixed or resolved the issue? Mark it as available to clear the flag."}
          </div>

          <Textarea
            placeholder="Optional notes (e.g., 'Found in truck', 'Replaced cable')"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-16 text-xs resize-none"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="gap-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500"
            disabled={resolving}
            onClick={handleResolve}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {resolving ? "Updating…" : isMissing ? "Mark as Found" : "Mark as Fixed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
