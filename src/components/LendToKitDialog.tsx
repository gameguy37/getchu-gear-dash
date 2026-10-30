import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/types";
import { kitLabel } from "@/lib/assetLogs";
import { useAssetPatch } from "@/hooks/useAssetPatch";

interface LendToKitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset;
  allAssets: Asset[];
  onLent?: (kitId: string) => void;
  /** Called with the pre-lend values if the background save fails. */
  onRollback?: (prev: Pick<Asset, "parent_asset_id" | "original_parent_id" | "is_borrowed">) => void;
}

export function LendToKitDialog({ open, onOpenChange, asset, allAssets, onLent, onRollback }: LendToKitDialogProps) {
  const patchAsset = useAssetPatch();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const saving = false;

  const groups = useMemo(() => {
    // Block the asset itself and its own descendants (no cycles)
    const blocked = new Set<string>([asset.id]);
    let added = true;
    while (added) {
      added = false;
      for (const a of allAssets) {
        if (a.parent_asset_id && blocked.has(a.parent_asset_id) && !blocked.has(a.id)) { blocked.add(a.id); added = true; }
      }
    }
    const roots = allAssets.filter((a) => !a.parent_asset_id);
    const rootIds = new Set(roots.map((r) => r.id));
    const subKits = allAssets.filter((a) => a.parent_asset_id && rootIds.has(a.parent_asset_id) && allAssets.some((c) => c.parent_asset_id === a.id));
    const map = new Map<string, { kit: Asset; parentName?: string }[]>();
    for (const r of roots) {
      if (blocked.has(r.id) || r.id === asset.parent_asset_id) continue;
      const cat = r.category || "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push({ kit: r });
      for (const s of subKits.filter((s) => s.parent_asset_id === r.id)) {
        if (blocked.has(s.id) || s.id === asset.parent_asset_id) continue;
        map.get(cat)!.push({ kit: s, parentName: r.asset_name });
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allAssets, asset]);

  const target = targetId ? allAssets.find((a) => a.id === targetId) : null;

  const handleLend = () => {
    if (!target) return;
    const fromName = asset.parent_asset_id ? allAssets.find((a) => a.id === asset.parent_asset_id)?.asset_name : null;
    const prevDetail = { parent_asset_id: asset.parent_asset_id, original_parent_id: asset.original_parent_id, is_borrowed: asset.is_borrowed };
    // Optimistic: cache + panel update instantly; rollback on failure.
    patchAsset.mutate(
      {
        id: asset.id,
        patch: { original_parent_id: asset.original_parent_id ?? asset.parent_asset_id ?? undefined, parent_asset_id: target.id, is_borrowed: true },
        log: { action: "Lent", details: `Lent from ${kitLabel(fromName)} to ${target.asset_name}` },
      },
      { onError: () => onRollback?.(prevDetail) }
    );
    toast.success(`Successfully lent to ${target.asset_name}`);
    onLent?.(target.id);
    setTargetId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setTargetId(null); onOpenChange(v); }}>
      <DialogContent className="border-border/60 bg-[#121214]/80 backdrop-blur-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lend to Another Kit</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Lend <strong className="text-foreground">{asset.asset_name}</strong> to another kit. Its current home is remembered so it can be returned later.
        </p>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="h-[52px] w-full justify-between rounded-2xl bg-foreground/5 text-base">
              <span className="truncate">{target ? target.asset_name : "Choose destination kit…"}</span>
              <ChevronsUpDown className="h-4 w-4 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="z-[60] w-[--radix-popover-trigger-width] rounded-2xl border-border/60 bg-popover/95 p-0 backdrop-blur-xl shadow-[var(--shadow-float)] overflow-hidden"
          >
            <Command>
              <CommandInput placeholder="Search kits…" className="text-base" />
              <CommandList className="thin-scrollbar max-h-[240px] overflow-y-auto overscroll-contain">
                <CommandEmpty>No kits found.</CommandEmpty>
                {groups.map(([cat, items]) => (
                  <CommandGroup key={cat} heading={cat}>
                    {items.map(({ kit, parentName }) => (
                      <CommandItem
                        key={kit.id}
                        value={`${kit.asset_name} ${parentName ?? ""} ${cat} ${kit.id}`}
                        onSelect={() => { setTargetId(kit.id); setPickerOpen(false); }}
                        className={cn("gap-2", parentName && "pl-6")}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: kit.color_code || "hsl(var(--primary))" }} />
                        <span className="flex-1 truncate">{kit.asset_name}</span>
                        {parentName && <span className="truncate text-[11px] text-muted-foreground">in {parentName}</span>}
                        {targetId === kit.id && <Check className="h-4 w-4 text-primary" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" className="h-[52px] rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="h-[52px] rounded-full gap-1.5" disabled={!target || saving} onClick={handleLend}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Lend
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
