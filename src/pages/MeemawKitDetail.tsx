import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, AlertTriangle, Box, User } from "lucide-react";

export default function MeemawKitDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: kit, isLoading } = useQuery({
    queryKey: ["meemaw_kit_detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("meemaw_kits" as any).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["meemaw_kit_detail_members", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("meemaw_kit_members" as any).select("*").eq("kit_id", id).order("position");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const parentIds = useMemo(() => members.map((m) => m.asset_id), [members]);

  const { data: parentAssets = [] } = useQuery({
    queryKey: ["meemaw_parent_assets", parentIds],
    enabled: parentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("*").in("id", parentIds);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: childAssets = [] } = useQuery({
    queryKey: ["meemaw_child_assets", parentIds],
    enabled: parentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("*").in("parent_asset_id", parentIds);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: lostItems = [] } = useQuery({
    queryKey: ["meemaw_lost_items", parentIds],
    enabled: parentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("sea_of_lost_items").select("*").in("parent_asset_id", parentIds);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["meemaw_detail_employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,name").order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
  const empById = useMemo(() => new Map(employees.map((e: any) => [e.id, e])), [employees]);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading kit…</div>;
  }
  if (!kit) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-foreground font-semibold">Meemaw kit not found.</p>
        <Button variant="outline" onClick={() => navigate("/meemaw-kits")}>Back to kits</Button>
      </div>
    );
  }

  const parentById = new Map(parentAssets.map((a: any) => [a.id, a]));
  const childrenByParent = new Map<string, any[]>();
  childAssets.forEach((c: any) => {
    const arr = childrenByParent.get(c.parent_asset_id) ?? [];
    arr.push(c);
    childrenByParent.set(c.parent_asset_id, arr);
  });
  const lostByParent = new Map<string, any[]>();
  lostItems.forEach((l: any) => {
    const arr = lostByParent.get(l.parent_asset_id) ?? [];
    arr.push(l);
    lostByParent.set(l.parent_asset_id, arr);
  });

  const totalChildren = childAssets.length;
  const flaggedChildren = childAssets.filter((c: any) =>
    ["missing", "broken", "iffy"].includes(c.status)
  );
  const sharedOut = members.filter((m: any) => m.shared_out);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card className="p-5 rounded-2xl space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-4xl">{kit.emoji ?? "👵"}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{kit.name}</h1>
            {kit.description && <p className="text-sm text-muted-foreground mt-1">{kit.description}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <Box className="h-4 w-4 mx-auto text-muted-foreground" />
            <p className="text-xl font-bold mt-1">{kit.case_count ?? 1}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cases</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <Package className="h-4 w-4 mx-auto text-muted-foreground" />
            <p className="text-xl font-bold mt-1">{members.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Components</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <Package className="h-4 w-4 mx-auto text-muted-foreground" />
            <p className="text-xl font-bold mt-1">{totalChildren}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sub-items</p>
          </div>
        </div>

        {(flaggedChildren.length > 0 || lostItems.length > 0 || sharedOut.length > 0) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {flaggedChildren.length > 0 && (
              <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/40">
                <AlertTriangle className="h-3 w-3" /> {flaggedChildren.length} flagged
              </Badge>
            )}
            {lostItems.length > 0 && (
              <Badge variant="outline" className="gap-1 text-destructive border-destructive/40">
                <AlertTriangle className="h-3 w-3" /> {lostItems.length} reported missing
              </Badge>
            )}
            {sharedOut.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <User className="h-3 w-3" /> {sharedOut.length} shared out
              </Badge>
            )}
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground px-1">Inside this kit</h2>
        {members.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground rounded-2xl">No components yet.</Card>
        )}
        {members.map((m: any) => {
          const parent = parentById.get(m.asset_id);
          const kids = childrenByParent.get(m.asset_id) ?? [];
          const lost = lostByParent.get(m.asset_id) ?? [];
          const borrower = m.shared_with_employee_id ? empById.get(m.shared_with_employee_id) : null;
          return (
            <Card key={m.id} className={`p-4 rounded-2xl space-y-2 ${m.shared_out ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <Link to={`/scanner?asset=${m.asset_id}`} className="font-semibold hover:underline truncate">
                  {parent?.asset_name ?? "Unknown asset"}
                </Link>
                <Badge variant="outline" className="text-[10px]">{parent?.status ?? "—"}</Badge>
              </div>
              {parent?.category && <p className="text-xs text-muted-foreground">{parent.category}</p>}
              {m.shared_out && (
                <p className="text-xs text-amber-600">
                  Shared out{borrower ? ` to ${(borrower as any).name}` : ""}
                  {m.shared_notes ? ` · ${m.shared_notes}` : ""}
                </p>
              )}
              {kids.length > 0 && (
                <div className="pt-1 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sub-items ({kids.length})</p>
                  {kids.map((c: any) => {
                    const flagged = ["missing", "broken", "iffy"].includes(c.status);
                    return (
                      <div key={c.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-sm ${flagged ? "bg-destructive/10 text-destructive" : "bg-muted/40"}`}>
                        <span className="truncate">{c.asset_name}</span>
                        <Badge variant="outline" className="text-[10px]">{c.status?.replace(/_/g, " ")}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
              {lost.length > 0 && (
                <div className="pt-1 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-destructive">Reported missing</p>
                  {lost.map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-sm bg-destructive/10 text-destructive">
                      <span className="truncate">{l.item_name}</span>
                      <span className="text-[11px]">×{l.missing_quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
