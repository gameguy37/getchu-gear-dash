import { motion } from "framer-motion";
import { AlertTriangle, Package, CheckCircle2, Wrench, Anchor, Calendar, User, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAssets, useUpdateAssetStatus, useEmployees, useAssignments, useLostItems, useResolveLostItem } from "@/hooks/useSupabaseData";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/LoadingSkeleton";
import { format } from "date-fns";

const conditionBadge = (condition: string) => {
  switch (condition) {
    case "broken":
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">Broken</Badge>;
    case "iffy":
      return <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">Iffy</Badge>;
    default:
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">Missing</Badge>;
  }
};

export default function SeaOfMissingAssets() {
  const { data: assets = [], isLoading: assetsLoading } = useAssets();
  const { data: employees = [] } = useEmployees();
  const { data: assignments = [] } = useAssignments();
  const { data: lostItems = [], isLoading: lostLoading } = useLostItems();
  const updateStatus = useUpdateAssetStatus();
  const resolveLostItem = useResolveLostItem();

  const isLoading = assetsLoading || lostLoading;
  if (isLoading) return <TableSkeleton />;

  const flaggedAssets = assets.filter((a) => a.status === "missing" || a.status === "broken");
  const missingAssets = flaggedAssets.filter((a) => a.status === "missing");
  const brokenAssets = flaggedAssets.filter((a) => a.status === "broken");

  const handleMarkFound = (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    updateStatus.mutate(
      { id: assetId, status: "available" },
      { onSuccess: () => toast.success(`${asset?.asset_name ?? "Asset"} marked as available!`) }
    );
  };

  const handleResolveLostItem = (item: typeof lostItems[0]) => {
    // Find the child asset by name + parent to restore quantity
    const childAsset = assets.find(
      (a) => a.asset_name === item.item_name && a.parent_asset_id === item.parent_asset_id
    );
    resolveLostItem.mutate(
      { lostItemId: item.id, assetId: childAsset?.id, restoreQuantity: item.missing_quantity },
      { onSuccess: () => toast.success(`${item.item_name} resolved and quantity restored!`) }
    );
  };

  const getLastOperator = (assetId: string) => {
    const assignment = assignments.find((a) => a.asset_ids?.includes(assetId));
    if (!assignment) return null;
    return employees.find((e) => e.id === assignment.operator_id);
  };

  const renderAssetCard = (asset: typeof assets[0], i: number) => {
    const isBroken = asset.status === "broken";
    const operator = getLastOperator(asset.id);
    const borderClass = isBroken ? "border-warning/30 hover:border-warning/50" : "border-destructive/20 hover:border-destructive/40";
    const bgClass = isBroken ? "bg-warning/5" : "bg-destructive/5";
    const iconBg = isBroken ? "bg-warning/10" : "bg-destructive/10";
    const iconColor = isBroken ? "text-warning" : "text-destructive";

    return (
      <motion.div key={asset.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
        <Card className={`p-4 ${bgClass} ${borderClass} transition-colors glass-card`}>
          <div className="flex gap-3">
            <div className={`flex items-center justify-center h-14 w-14 rounded-lg ${iconBg} shrink-0`}>
              {isBroken ? <Wrench className={`h-6 w-6 ${iconColor}`} /> : <Package className={`h-6 w-6 ${iconColor}`} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{asset.asset_name}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={`text-[10px] ${isBroken ? "border-warning/30 text-warning" : "border-destructive/30 text-destructive"}`}>
                  {isBroken ? "Broken" : "Missing"}
                </Badge>
              </div>
              {asset.serial && <p className="text-xs text-muted-foreground mt-1">SN: {asset.serial}</p>}
              {operator && <p className="text-xs text-muted-foreground mt-1">Last Op: {operator.name}</p>}
            </div>
          </div>
          {asset.damage_notes && (
            <div className="mt-2 rounded-md bg-card/60 border border-border/30 p-2">
              <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5">Operator Note</p>
              <p className="text-xs text-foreground/80">{asset.damage_notes}</p>
            </div>
          )}
          <Button size="sm" variant="outline" className="w-full mt-3 gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success" onClick={() => handleMarkFound(asset.id)}>
            <CheckCircle2 className="h-3.5 w-3.5" />Mark as Available
          </Button>
        </Card>
      </motion.div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6 min-h-full space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-destructive/10">
          <Anchor className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sea of Lost & Broken Items</h1>
          <p className="text-sm text-muted-foreground">
            {flaggedAssets.length} flagged asset{flaggedAssets.length !== 1 ? "s" : ""} · {lostItems.length} shrinkage record{lostItems.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* ─── Shrinkage Log (Commodity losses) ─── */}
      {lostItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <Anchor className="h-3.5 w-3.5" /> Shrinkage Log ({lostItems.length})
          </p>
          <div className="space-y-2">
            {lostItems.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="p-3 glass-card border-primary/10 hover:border-primary/20 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-destructive/10 shrink-0">
                      <Package className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{item.item_name}</span>
                        {conditionBadge(item.condition)}
                        {item.condition === "missing" && (
                          <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                            ×{item.missing_quantity} lost
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {item.parent_rig_name && (
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" /> {item.parent_rig_name}
                          </span>
                        )}
                        {item.operator_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {item.operator_name}
                          </span>
                        )}
                        {item.job && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {item.job.client_name} {item.job.job_date ? `· ${format(new Date(item.job.job_date), "MMM d")}` : ""}
                          </span>
                        )}
                        <span>{format(new Date(item.reported_at), "MMM d, h:mm a")}</span>
                      </div>
                      {item.notes && <p className="text-xs text-foreground/70">{item.notes}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success"
                      onClick={() => handleResolveLostItem(item)}
                      disabled={resolveLostItem.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Found / Resolved
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Flagged Assets (Missing / Broken hardware) ─── */}
      {flaggedAssets.length === 0 && lostItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg bg-success/5 border border-success/20">
          <CheckCircle2 className="h-12 w-12 text-success mb-3" />
          <p className="text-lg font-semibold text-foreground">All clear!</p>
          <p className="text-sm text-muted-foreground">No missing, broken, or lost gear.</p>
        </div>
      ) : (
        <>
          {missingAssets.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive mb-3">Missing ({missingAssets.length})</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {missingAssets.map((asset, i) => renderAssetCard(asset, i))}
              </div>
            </div>
          )}
          {brokenAssets.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-warning mb-3">Broken ({brokenAssets.length})</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {brokenAssets.map((asset, i) => renderAssetCard(asset, i))}
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
