import { useState } from "react";
import { format } from "date-fns";
import { History, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

type Entry = {
  id: string;
  created_at: string;
  kind: "move" | "status";
  action: string;
  details: string;
};

const actionTone: Record<string, string> = {
  Lent: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Returned: "bg-green-500/15 text-green-400 border-green-500/30",
  "Made Permanent": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Moved: "bg-foreground/10 text-foreground border-border/60",
};

export function AssetHistoryTimeline({ assetId }: { assetId: string }) {
  const [open, setOpen] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["asset_logs", assetId],
    enabled: open,
    staleTime: 10000,
    queryFn: async (): Promise<Entry[]> => {
      const [logs, status] = await Promise.all([
        (supabase as any).from("asset_logs").select("id, action, details, created_at").eq("asset_id", assetId).order("created_at", { ascending: false }).limit(100),
        supabase.from("asset_history_logs").select("id, previous_status, new_status, changed_by_name, created_at").eq("asset_id", assetId).order("created_at", { ascending: false }).limit(100),
      ]);
      const a: Entry[] = (logs.data ?? []).map((r: any) => ({ id: `l-${r.id}`, created_at: r.created_at, kind: "move", action: r.action, details: r.details ?? "" }));
      const b: Entry[] = (status.data ?? []).map((r: any) => ({
        id: `s-${r.id}`, created_at: r.created_at, kind: "status",
        action: `${r.previous_status ?? "—"}→${r.new_status ?? "—"}`,
        details: r.changed_by_name ? `by ${r.changed_by_name}` : "",
      }));
      return [...a, ...b].sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at));
    },
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-xl">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-muted-foreground" /> History / Logs
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        {isLoading && <p className="text-xs text-gray-400">Loading…</p>}
        {!isLoading && rows && rows.length === 0 && <p className="text-xs text-gray-400 italic">No history recorded yet.</p>}
        {!isLoading && rows && rows.length > 0 && (
          <ol className="relative border-l border-border/60 ml-2 space-y-3 pt-1">
            {rows.map((r) => (
              <li key={r.id} className="ml-4 relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary/70 ring-2 ring-background" />
                {r.kind === "move" ? (
                  <Badge variant="outline" className={`text-[10px] rounded-full ${actionTone[r.action] ?? actionTone.Moved}`}>{r.action}</Badge>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs flex-wrap">
                    <Badge variant="outline" className="text-[10px] rounded-full">{r.action.split("→")[0]}</Badge>
                    <ArrowRight className="h-3 w-3 text-gray-400" />
                    <Badge variant="outline" className="text-[10px] rounded-full">{r.action.split("→")[1]}</Badge>
                  </div>
                )}
                {r.details && <p className="text-xs text-gray-400 mt-1">{r.details}</p>}
                <p className="text-[11px] text-gray-400/80 mt-0.5">{format(new Date(r.created_at), "MMM d, yyyy · h:mm a")}</p>
              </li>
            ))}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
