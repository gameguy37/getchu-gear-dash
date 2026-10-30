import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAssets } from "@/hooks/useSupabaseData";
import { toast } from "sonner";
import { Laptop, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { TableSkeleton } from "@/components/LoadingSkeleton";
import type { ComputerSpec } from "@/lib/types";

const DEFAULT_LATEST = "macOS 16.3";

export default function MacBookUpdates() {
  const { data: assets = [], isLoading } = useAssets();
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Only actual laptops — child assets of Computer Kits that have MacBook metadata
  const computerAssets = useMemo(
    () => assets.filter((a) => {
      if (a.category !== "Computer Kit" || !a.parent_asset_id) return false;
      const spec = (a.metadata ?? {}) as ComputerSpec;
      // Must have a MacBook model OR look like a laptop by name (exclude accessories)
      const name = (a.asset_name ?? "").toLowerCase();
      const isLaptopByName = name.includes("macbook") || name.includes("laptop");
      return Boolean(spec.macbook_type) || isLaptopByName;
    }),
    [assets]
  );

  // Also find parent names for context
  const parentMap = useMemo(() => {
    const map = new Map<string, string>();
    assets.filter(a => a.category === "Computer Kit" && !a.parent_asset_id).forEach(a => map.set(a.id, a.asset_name));
    return map;
  }, [assets]);

  if (isLoading) return <TableSkeleton rows={2} />;

  const logUpdate = (assetId: string) => {
    setOverrides((prev) => ({ ...prev, [assetId]: DEFAULT_LATEST }));
    const asset = assets.find((a) => a.id === assetId);
    toast.success(`${asset?.asset_name} logged as updated to ${DEFAULT_LATEST}.`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 glow-primary"><Laptop className="h-5 w-5 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">MacBook Update Hub</h1>
          <p className="text-sm text-muted-foreground">Track and manage OS updates for all computer kits</p>
        </div>
      </div>

      <Card className="glass p-4 border-primary/20">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Monthly Update Report — {currentMonth}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Review each computer below. The latest available macOS is shown. Log updates as they're applied.
        </p>
      </Card>

      {computerAssets.length === 0 ? (
        <Card className="glass p-8 text-center">
          <Laptop className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No computers found. Add a Computer Kit via Asset Management with computer specs to track updates.</p>
        </Card>
      ) : (
        <Card className="glass overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-muted-foreground">Computer</TableHead>
                <TableHead className="text-muted-foreground">Parent Kit</TableHead>
                <TableHead className="text-muted-foreground">Model</TableHead>
                <TableHead className="text-muted-foreground">Serial</TableHead>
                <TableHead className="text-muted-foreground">Current OS</TableHead>
                <TableHead className="text-muted-foreground">Latest</TableHead>
                <TableHead className="text-muted-foreground">Prompter</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computerAssets.map((asset) => {
                const spec = (asset.metadata ?? {}) as ComputerSpec;
                const currentOS = overrides[asset.id] ?? spec.os_version ?? "Unknown";
                const upToDate = currentOS === DEFAULT_LATEST;
                const parentName = asset.parent_asset_id ? parentMap.get(asset.parent_asset_id) ?? "—" : "—";

                return (
                  <TableRow key={asset.id} className="border-border/30 hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Laptop className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="text-sm font-medium text-foreground">{spec.login_name || asset.asset_name}</span>
                          {spec.macbook_type && <p className="text-[10px] text-muted-foreground">{spec.macbook_type} {spec.year ?? ""}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><span className="text-sm text-muted-foreground">{parentName}</span></TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground">
                        {spec.macbook_type ? `${spec.macbook_type} ${spec.year ?? ""}` : <span className="text-muted-foreground italic">Not set</span>}
                      </span>
                    </TableCell>
                    <TableCell><span className="font-mono text-sm text-muted-foreground">{asset.serial || "—"}</span></TableCell>
                    <TableCell><span className="font-mono text-sm text-foreground">{currentOS}</span></TableCell>
                    <TableCell><span className="font-mono text-sm text-primary">{DEFAULT_LATEST}</span></TableCell>
                    <TableCell><span className="text-sm text-muted-foreground">{spec.prompter_version ?? "—"}</span></TableCell>
                    <TableCell>
                      {upToDate ? (
                        <Badge className="bg-success/15 text-success border-success/30 glow-success text-[11px]" variant="outline">
                          <CheckCircle2 className="h-3 w-3 mr-1" />Up to Date
                        </Badge>
                      ) : (
                        <Badge className="bg-warning/20 text-warning border-warning/30 glow-warning text-[11px]" variant="outline">
                          Needs Update → {DEFAULT_LATEST}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!upToDate && (
                        <Button size="sm" className="gap-1.5 text-xs glow-primary" onClick={() => logUpdate(asset.id)}>
                          <RefreshCw className="h-3.5 w-3.5" />Log Update
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </motion.div>
  );
}
