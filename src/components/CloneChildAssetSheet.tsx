import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Search, Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface ClonableChild {
  name: string;
  brand: string;
  category: string;
  price: string;
  cable_length: string;
}

interface DbChild {
  id: string;
  asset_name: string | null;
  brand: string | null;
  category: string | null;
  original_value: number | null;
  cable_length: string | null;
}

interface CloneChildAssetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (data: ClonableChild) => void;
}

export function CloneChildAssetSheet({ open, onOpenChange, onSelect }: CloneChildAssetSheetProps) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<DbChild[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("assets")
      .select("id, asset_name, brand, category, original_value, cable_length")
      .not("parent_asset_id", "is", null)
      .order("asset_name", { ascending: true })
      .limit(500)
      .then(({ data }) => {
        setItems((data as DbChild[]) || []);
        setLoading(false);
      });
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items.slice(0, 100);
    return items
      .filter((it) =>
        (it.asset_name || "").toLowerCase().includes(q) ||
        (it.brand || "").toLowerCase().includes(q) ||
        (it.category || "").toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [search, items]);

  const handlePick = (it: DbChild) => {
    onSelect({
      name: it.asset_name || "",
      brand: it.brand || "",
      category: it.category || "",
      price: it.original_value != null ? Number(it.original_value).toFixed(2) : "",
      cable_length: it.cable_length || "",
    });
    setSearch("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[80vh] flex flex-col p-0">
        <SheetHeader className="p-5 pb-3 border-b border-border/60">
          <SheetTitle>Clone from Existing</SheetTitle>
          <div className="relative mt-2">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, brand, category..."
              className="pl-9 h-11 rounded-2xl text-[16px] md:text-sm"
            />
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12 italic">
              {search ? "No matches found." : "No child assets in inventory yet."}
            </p>
          ) : (
            filtered.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => handlePick(it)}
                className="w-full text-left rounded-2xl border-[1.5px] border-border/60 bg-muted/30 hover:bg-muted/60 active:scale-[0.99] transition p-3 flex items-center gap-3 min-h-[60px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{it.asset_name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[it.brand, it.category, it.cable_length, it.original_value != null ? `$${Number(it.original_value).toFixed(2)}` : null]
                      .filter(Boolean)
                      .join(" · ") || "No details"}
                  </p>
                </div>
                <Copy className="h-4 w-4 text-primary shrink-0" />
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
