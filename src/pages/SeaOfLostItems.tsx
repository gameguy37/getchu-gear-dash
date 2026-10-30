import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Package, CheckCircle2, Anchor, Calendar, User, Search, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAssets, useUpdateAssetStatus, useEmployees, useAssignments, useLostItems, useResolveLostItem, useReplaceLostItem } from "@/hooks/useSupabaseData";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/LoadingSkeleton";
import { format } from "date-fns";
import { AssetPhoto } from "@/components/AssetPhoto";

export default function SeaOfLostItems() {
  const navigate = useNavigate();
  const { data: assets = [], isLoading: assetsLoading } = useAssets();
  const { data: employees = [] } = useEmployees();
  const { data: assignments = [] } = useAssignments();
  const { data: lostItems = [], isLoading: lostLoading } = useLostItems();
  const updateStatus = useUpdateAssetStatus();
  const resolveLostItem = useResolveLostItem();
  const replaceLostItem = useReplaceLostItem();

  const [replaceOpenId, setReplaceOpenId] = useState<string | null>(null);
  const [replaceCost, setReplaceCost] = useState("");

  const isLoading = assetsLoading || lostLoading;
  if (isLoading) return <TableSkeleton />;

  const missingAssets = assets.filter((a) => a.status === "missing");
  const missingLostItems = lostItems.filter((i) => i.condition === "missing");

  // ── Found handler for shrinkage log items ──
  const handleFoundLostItem = (item: typeof lostItems[0]) => {
    const childAsset = assets.find(
      (a) => a.asset_name === item.item_name && a.parent_asset_id === item.parent_asset_id
    );
    resolveLostItem.mutate(
      { lostItemId: item.id, assetId: childAsset?.id, restoreQuantity: item.missing_quantity },
      { onSuccess: () => toast.success(`${item.item_name} marked as Found and restored!`) }
    );
  };

  // ── Replaced handler for shrinkage log items ──
  const handleReplaceLostItem = (item: typeof lostItems[0]) => {
    const cost = parseFloat(replaceCost);
    if (isNaN(cost) || cost < 0) {
      toast.error("Please enter a valid replacement cost.");
      return;
    }
    const childAsset = assets.find(
      (a) => a.asset_name === item.item_name && a.parent_asset_id === item.parent_asset_id
    );
    replaceLostItem.mutate(
      { lostItemId: item.id, assetId: childAsset?.id, restoreQuantity: item.missing_quantity, replacementCost: cost },
      {
        onSuccess: () => {
          toast.success(`${item.item_name} replaced ($${cost.toFixed(2)}) and restored!`);
          setReplaceOpenId(null);
          setReplaceCost("");
        },
      }
    );
  };

  // ── Found handler for hardware assets ──
  const handleMarkFound = (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    updateStatus.mutate(
      { id: assetId, status: "available" },
      { onSuccess: () => toast.success(`${asset?.asset_name ?? "Asset"} marked as Found!`) }
    );
  };

  const getLastOperator = (assetId: string) => {
    const assignment = assignments.find((a) => a.asset_ids?.includes(assetId));
    if (!assignment) return null;
    return employees.find((e) => e.id === assignment.operator_id);
  };

  const totalItems = missingAssets.length + missingLostItems.length;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6 min-h-full space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-destructive/10">
          <Anchor className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sea of Lost Items</h1>
          <p className="text-sm text-muted-foreground">
            {totalItems} missing item{totalItems !== 1 ? "s" : ""} to track down
          </p>
        </div>
      </div>

      {/* Shrinkage log — missing commodity items */}
      {missingLostItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <Anchor className="h-3.5 w-3.5" /> Shrinkage Log ({missingLostItems.length})
          </p>
          <div className="space-y-2">
            {missingLostItems.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="p-3 glass-card border-primary/10 hover:border-primary/20 transition-colors">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => item.parent_asset_id && navigate(`/assets?asset=${item.parent_asset_id}`)}
                      className="flex items-start gap-3 flex-1 min-w-0 text-left rounded-md hover:bg-primary/5 -m-1 p-1 transition-colors disabled:cursor-default"
                      disabled={!item.parent_asset_id}
                    >
                      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-destructive/10 shrink-0">
                        <Package className="h-5 w-5 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{item.item_name}</span>
                          <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">Missing</Badge>
                          <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                            ×{item.missing_quantity} lost
                          </Badge>
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
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success" onClick={() => handleFoundLostItem(item)} disabled={resolveLostItem.isPending}>
                        <Search className="h-3.5 w-3.5" />Found
                      </Button>
                      <Popover open={replaceOpenId === item.id} onOpenChange={(open) => { setReplaceOpenId(open ? item.id : null); if (!open) setReplaceCost(""); }}>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                            <ShoppingCart className="h-3.5 w-3.5" />Replaced
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 space-y-3">
                          <p className="text-sm font-semibold text-foreground">Replacement Cost</p>
                          <p className="text-xs text-muted-foreground">Enter the cost to replace <strong>{item.item_name}</strong> ×{item.missing_quantity}.</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">$</span>
                            <Input type="number" min={0} step={0.01} placeholder="0.00" value={replaceCost} onChange={(e) => setReplaceCost(e.target.value)} className="h-9" />
                          </div>
                          <Button size="sm" className="w-full" onClick={() => handleReplaceLostItem(item)} disabled={replaceLostItem.isPending}>
                            Confirm Replacement
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Missing hardware assets */}
      {missingAssets.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-destructive mb-3">Missing Hardware ({missingAssets.length})</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {missingAssets.map((asset, i) => {
              const operator = getLastOperator(asset.id);
              return (
                <motion.div key={asset.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="p-4 bg-destructive/5 border-destructive/20 hover:border-destructive/40 transition-colors glass-card">
                    <button
                      type="button"
                      onClick={() => navigate(`/assets?asset=${asset.id}`)}
                      className="flex gap-3 w-full text-left rounded-md hover:bg-destructive/5 -m-1 p-1 transition-colors"
                    >
                      <div className="flex items-center justify-center h-14 w-14 rounded-lg bg-destructive/10 shrink-0 overflow-hidden">
                        {asset.damage_photo_url ? (
                          <AssetPhoto src={asset.damage_photo_url} alt="Damage" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="h-6 w-6 text-destructive" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{asset.asset_name}</p>
                        <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive mt-1">Missing</Badge>
                        {asset.serial && <p className="text-xs text-muted-foreground mt-1">SN: {asset.serial}</p>}
                        {operator && <p className="text-xs text-muted-foreground mt-1">Last Op: {operator.name}</p>}
                      </div>
                    </button>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success" onClick={() => handleMarkFound(asset.id)}>
                        <Search className="h-3.5 w-3.5" />Found
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary" onClick={() => {
                        updateStatus.mutate({ id: asset.id, status: "available" }, { onSuccess: () => toast.success(`${asset.asset_name} marked as Replaced!`) });
                      }}>
                        <ShoppingCart className="h-3.5 w-3.5" />Replaced
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {totalItems === 0 && (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg bg-success/5 border border-success/20">
          <CheckCircle2 className="h-12 w-12 text-success mb-3" />
          <p className="text-lg font-semibold text-foreground">All clear!</p>
          <p className="text-sm text-muted-foreground">No missing gear — smooth sailing.</p>
        </div>
      )}
    </motion.div>
  );
}
