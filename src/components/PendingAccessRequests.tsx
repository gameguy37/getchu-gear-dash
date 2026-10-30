import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { UserPlus, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Req = { id: string; name: string | null; email: string | null };

export function PendingAccessRequests() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["pending-access-requests"],
    staleTime: 10000,
    queryFn: async (): Promise<Req[]> => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, email")
        .eq("status", "pending")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase
        .from("employees")
        .update(approve ? { status: "active", role: "operator" } : { status: "denied" })
        .eq("id", id);
      if (error) throw error;
      return approve;
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["pending-access-requests"] });
      const prev = qc.getQueryData<Req[]>(["pending-access-requests"]);
      qc.setQueryData<Req[]>(["pending-access-requests"], (cur) => (cur ?? []).filter((r) => r.id !== id));
      return { prev };
    },
    onError: (err: any, _v, ctx) => {
      qc.setQueryData(["pending-access-requests"], ctx?.prev);
      toast.error(`Couldn't update request: ${err.message}`);
    },
    onSuccess: (approve) => toast.success(approve ? "Operator Approved" : "Request Denied"),
    onSettled: () => qc.invalidateQueries(),
  });

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-xl p-4 space-y-3">
      <header className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Pending Access Requests</h2>
        {data.length > 0 && (
          <span className="ml-auto rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-semibold px-2 py-0.5">{data.length}</span>
        )}
      </header>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : data.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">No pending requests.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          <AnimatePresence initial={false}>
            {data.map((r) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 40, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                </div>
                <button
                  onClick={() => decide.mutate({ id: r.id, approve: true })}
                  className="min-h-[44px] rounded-full px-4 flex items-center gap-1.5 text-sm font-semibold bg-green-500/20 text-green-400 hover:bg-green-500/30 active:scale-95 transition"
                >
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button
                  onClick={() => decide.mutate({ id: r.id, approve: false })}
                  className="min-h-[44px] rounded-full px-4 flex items-center gap-1.5 text-sm font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-95 transition"
                >
                  <X className="h-4 w-4" /> Deny
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
