import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Wrench, CheckCircle2, Package, Calendar, User, RotateCcw, AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAssets, useUpdateAssetStatus, useEmployees, useAssignments, useLostItems, useResolveLostItem } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
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
      return <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">{condition}</Badge>;
  }
};

export default function BoulevardOfBrokenItems() {
  const navigate = useNavigate();
  const { data: assets = [], isLoading: assetsLoading } = useAssets();
  const { data: employees = [] } = useEmployees();
  const { data: assignments = [] } = useAssignments();
  const { data: lostItems = [], isLoading: lostLoading } = useLostItems();
  const updateStatus = useUpdateAssetStatus();
  const resolveLostItem = useResolveLostItem();
  const queryClient = useQueryClient();

  const isLoading = assetsLoading || lostLoading;
  if (isLoading) return <TableSkeleton />;

  const brokenAssets = assets.filter((a) => a.status === "broken");
  const iffyAssets = assets.filter((a) => a.status === "iffy");
  const missingAssets = assets.filter((a) => a.status === "missing");
  const damagedLostItems = lostItems.filter((i) => i.condition !== "missing" && i.condition !== "good");

  const handleMarkFixed = async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    // 1. Restore asset status to available, clear damage notes/photo
    updateStatus.mutate(
      { id: assetId, status: "available" },
      {
        onSuccess: async () => {
          // Also clear damage fields
          await supabase.from("assets").update({ damage_notes: null, damage_photo_url: null } as any).eq("id", assetId);
          // 2. Delete any matching sea_of_lost_items entries for this asset
          // Match by parent_asset_id (if this is a parent rig) or by name+parent combo
          await supabase.from("sea_of_lost_items").delete().eq("parent_asset_id", assetId);
          // Also match items where the asset name matches (child items tracked by name)
          if (asset?.asset_name) {
            await supabase.from("sea_of_lost_items").delete().eq("item_name", asset.asset_name);
          }
          queryClient.invalidateQueries({ queryKey: ["lost_items"] });
          toast.success(`${asset?.asset_name ?? "Asset"} fully restored to available!`);
        },
      }
    );
  };

  const handleResolveLostItem = (item: typeof lostItems[0]) => {
    const childAsset = assets.find(
      (a) => a.asset_name === item.item_name && a.parent_asset_id === item.parent_asset_id
    );
    resolveLostItem.mutate(
      { lostItemId: item.id, assetId: childAsset?.id, restoreQuantity: item.missing_quantity },
      { onSuccess: () => toast.success(`${item.item_name} resolved!`) }
    );
  };

  const getLastOperator = (assetId: string) => {
    const assignment = assignments.find((a) => a.asset_ids?.includes(assetId));
    if (!assignment) return null;
    return employees.find((e) => e.id === assignment.operator_id);
  };

  const totalItems = brokenAssets.length + iffyAssets.length + missingAssets.length + damagedLostItems.length;

  const getRestoreLabel = (badgeLabel: string) => {
    switch (badgeLabel) {
      case "Missing": return "Found — Restore to Available";
      case "Broken": return "Fixed — Restore to Available";
      case "Iffy": return "Cleared — Restore to Available";
      default: return "Restore to Available";
    }
  };

  const renderAssetSection = (title: string, sectionAssets: typeof assets, colorClass: string, badgeLabel: string, Icon: typeof Wrench) => {
    if (sectionAssets.length === 0) return null;
    return (
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wider ${colorClass} mb-3`}>{title} ({sectionAssets.length})</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sectionAssets.map((asset, i) => {
            const operator = getLastOperator(asset.id);
            return (
              <motion.div key={asset.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-4 bg-warning/5 border-warning/30 hover:border-warning/50 transition-colors glass-card">
                  <button
                    type="button"
                    onClick={() => navigate(`/assets?asset=${asset.id}`)}
                    className="flex gap-3 w-full text-left rounded-md hover:bg-warning/10 -m-1 p-1 transition-colors"
                  >
                    <div className="flex items-center justify-center h-14 w-14 rounded-lg bg-warning/10 shrink-0">
                      <Icon className={`h-6 w-6 ${colorClass}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{asset.asset_name}</p>
                      <Badge variant="outline" className={`text-[10px] border-warning/30 ${colorClass} mt-1`}>{badgeLabel}</Badge>
                      {asset.serial && <p className="text-xs text-muted-foreground mt-1">SN: {asset.serial}</p>}
                      {operator && <p className="text-xs text-muted-foreground mt-1">Last Op: {operator.name}</p>}
                    </div>
                  </button>
                  {asset.damage_notes && (
                    <div className="mt-2 rounded-md bg-card/60 border border-border/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5">Note</p>
                      <p className="text-xs text-foreground/80">{asset.damage_notes}</p>
                    </div>
                  )}
                  <Button size="sm" variant="default" className="w-full mt-3 gap-1.5" onClick={() => handleMarkFixed(asset.id)} disabled={updateStatus.isPending}>
                    <CheckCircle2 className="h-3.5 w-3.5" />{getRestoreLabel(badgeLabel)}
                  </Button>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6 min-h-full space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-warning/10">
          <Wrench className="h-5 w-5 text-warning" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Flagged Gear</h1>
          <p className="text-sm text-muted-foreground">
            {totalItems} item{totalItems !== 1 ? "s" : ""} needing repair or attention
          </p>
        </div>
      </div>

      {/* Damaged commodity items from shrinkage log */}
      {damagedLostItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-warning mb-3 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Damaged Items Log ({damagedLostItems.length})
          </p>
          <div className="space-y-2">
            {damagedLostItems.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="p-3 glass-card border-warning/10 hover:border-warning/20 transition-colors">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => item.parent_asset_id && navigate(`/assets?asset=${item.parent_asset_id}`)}
                      disabled={!item.parent_asset_id}
                      className="flex items-start gap-3 flex-1 min-w-0 text-left rounded-md hover:bg-warning/10 -m-1 p-1 transition-colors disabled:cursor-default"
                    >
                      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-warning/10 shrink-0">
                        <Wrench className="h-5 w-5 text-warning" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{item.item_name}</span>
                          {conditionBadge(item.condition)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {item.parent_rig_name && <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {item.parent_rig_name}</span>}
                          {item.operator_name && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {item.operator_name}</span>}
                          {item.job && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{item.job.client_name} {item.job.job_date ? `· ${format(new Date(item.job.job_date), "MMM d")}` : ""}</span>}
                          <span>{format(new Date(item.reported_at), "MMM d, h:mm a")}</span>
                        </div>
                        {item.notes && <p className="text-xs text-foreground/70">{item.notes}</p>}
                      </div>
                    </button>
                    <Button size="sm" variant="outline" className="shrink-0 gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success" onClick={() => handleResolveLostItem(item)} disabled={resolveLostItem.isPending}>
                      <RotateCcw className="h-3.5 w-3.5" />Fixed
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {renderAssetSection("Missing Hardware", missingAssets, "text-destructive", "Missing", AlertTriangle)}
      {renderAssetSection("Broken Hardware", brokenAssets, "text-destructive", "Broken", Wrench)}
      {renderAssetSection("Iffy / Needs Attention", iffyAssets, "text-warning", "Iffy", HelpCircle)}

      {totalItems === 0 && (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg bg-success/5 border border-success/20">
          <CheckCircle2 className="h-12 w-12 text-success mb-3" />
          <p className="text-lg font-semibold text-foreground">Nothing flagged!</p>
          <p className="text-sm text-muted-foreground">All gear is in good condition.</p>
        </div>
      )}
    </motion.div>
  );
}
