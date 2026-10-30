import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Package, ArrowRight, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Asset } from "@/lib/types";
import { AssetPhoto } from "@/components/AssetPhoto";

interface BorrowItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentKitId: string;
  currentKitName: string;
  allAssets: Asset[];
}

interface KitGroup {
  kit: Asset;
  children: Asset[];
}

export function BorrowItemDialog({ open, onOpenChange, currentKitId, currentKitName, allAssets }: BorrowItemDialogProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [borrowing, setBorrowing] = useState(false);
  const [expandedKits, setExpandedKits] = useState<Set<string>>(new Set());

  // Group borrowable items by their parent kit
  const kitGroups = useMemo(() => {
    const borrowableItems = allAssets.filter(a =>
      a.parent_asset_id &&
      a.parent_asset_id !== currentKitId &&
      a.status === "available" &&
      !a.home_parent_id
    );

    const groupMap = new Map<string, KitGroup>();
    for (const item of borrowableItems) {
      const parentId = item.parent_asset_id!;
      if (!groupMap.has(parentId)) {
        const kit = allAssets.find(a => a.id === parentId);
        if (!kit) continue;
        groupMap.set(parentId, { kit, children: [] });
      }
      groupMap.get(parentId)!.children.push(item);
    }

    return Array.from(groupMap.values());
  }, [allAssets, currentKitId]);

  // Filter by search — match kit name OR child item name
  const filtered = useMemo(() => {
    if (!search.trim()) return kitGroups;
    const q = search.toLowerCase();
    return kitGroups
      .map(group => {
        const kitMatches = (group.kit.asset_name ?? "").toLowerCase().includes(q);
        if (kitMatches) return group; // show all children
        const matchingChildren = group.children.filter(c =>
          (c.asset_name ?? "").toLowerCase().includes(q)
        );
        if (matchingChildren.length === 0) return null;
        return { ...group, children: matchingChildren };
      })
      .filter(Boolean) as KitGroup[];
  }, [kitGroups, search]);

  // Auto-expand kits when searching
  const effectiveExpanded = useMemo(() => {
    if (search.trim()) return new Set(filtered.map(g => g.kit.id));
    return expandedKits;
  }, [search, filtered, expandedKits]);

  const toggleKit = (kitId: string) => {
    setExpandedKits(prev => {
      const next = new Set(prev);
      if (next.has(kitId)) next.delete(kitId);
      else next.add(kitId);
      return next;
    });
  };

  const handleBorrow = async () => {
    if (!selectedId) return;
    setBorrowing(true);
    try {
      const item = allAssets.find(a => a.id === selectedId);
      if (!item) throw new Error("Item not found");

      const { error } = await supabase.from("assets").update({
        home_parent_id: item.parent_asset_id,
        parent_asset_id: currentKitId,
        is_borrowed: true,
      } as any).eq("id", selectedId);
      if (error) throw error;

      toast.success(`Borrowed "${item.asset_name}" into ${currentKitName}`);
      qc.invalidateQueries({ queryKey: ["assets"] });
      setSelectedId(null);
      setSearch("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Borrow failed: ${err.message}`);
    } finally {
      setBorrowing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedId(null); setSearch(""); setExpandedKits(new Set()); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[540px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>🔄 Borrow Item from Another Kit</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select an available item from another kit to temporarily borrow into <strong>{currentKitName}</strong>.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search kits or items..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 max-h-[350px] min-h-[100px]">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No borrowable items found.</p>
          )}
          {filtered.map(group => {
            const isExpanded = effectiveExpanded.has(group.kit.id);
            return (
              <div key={group.kit.id} className="rounded-lg border border-border/50 overflow-hidden">
                {/* Kit header */}
                <button
                  type="button"
                  onClick={() => toggleKit(group.kit.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                  {group.kit.cover_image_url ? (
                    <AssetPhoto src={group.kit.cover_image_url} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-7 w-7 rounded shrink-0 flex items-center justify-center text-xs font-bold text-primary-foreground"
                      style={{ backgroundColor: group.kit.color_code || "hsl(var(--muted))" }}>
                      {(group.kit.asset_name ?? "K")[0]}
                    </div>
                  )}
                  <span className="text-sm font-semibold text-foreground truncate flex-1">{group.kit.asset_name}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {group.children.length} item{group.children.length !== 1 ? "s" : ""}
                  </Badge>
                </button>

                {/* Child items */}
                {isExpanded && (
                  <div className="border-t border-border/30 bg-muted/20">
                    {group.children.map(item => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 px-4 pl-10 py-2 cursor-pointer transition-colors ${
                          selectedId === item.id
                            ? "bg-primary/10 border-l-2 border-l-primary"
                            : "hover:bg-muted/40 border-l-2 border-l-transparent"
                        }`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground truncate flex-1">{item.asset_name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{item.category}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleBorrow} disabled={!selectedId || borrowing}>
            {borrowing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Borrowing...</> :
              <><ArrowRight className="h-4 w-4 mr-1.5" />Borrow Item</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
