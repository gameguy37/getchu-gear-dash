import { useMemo, useState, useEffect, useCallback } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, MapPin, Navigation, ExternalLink, Package, Calendar as CalendarIcon,
  Building2, ChevronDown, ChevronUp, AlertTriangle, Play, Square, CheckCircle2, XCircle, Timer, Utensils, Pencil,
  ArrowLeft, ArrowRight, CalendarDays, Zap, ShieldAlert, Car, Wrench, MessageSquare, Bell, BellOff, Star, History,
} from "lucide-react";
import OperatorArchive from "./OperatorArchive";
import {
  format, isSameDay, parseISO, parse, differenceInSeconds,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, addWeeks, subWeeks, addMonths, subMonths,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useJobs, useAssets, useAssignments, useUpdateAssignment, useCreateAdminNotification, useUpdateAssetStatus, useUpdateAsset, useCreateLostItem, useUpdateJobStatus, useLostItems } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { OperatorSkeleton } from "@/components/LoadingSkeleton";
import { getGoogleMapsDirectionsUrl } from "@/lib/maps";
import { toast } from "sonner";
import type { Asset, Job, Assignment, JobStatus, MissingAssetNote } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LiveChatThread } from "@/components/LiveChatThread";
import { SmsOptInCard } from "@/components/SmsOptInCard";
import { PendingMissionAlert } from "@/components/PendingMissionAlert";
import { GearLoadoutAccordion } from "@/components/GearLoadoutAccordion";


const pillColors: Record<JobStatus, string> = {
  needs_prep: "bg-primary/20 text-primary border-primary/30",
  ready_for_takeoff: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  launched: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  pending_sign_off: "bg-accent/20 text-accent border-accent/30",
  completed: "bg-muted/40 text-muted-foreground border-border",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};

interface CallSheetData {
  job: Job;
  assets: Asset[];
  assignment: Assignment;
}

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(Math.abs(totalSeconds) / 3600);
  const m = Math.floor((Math.abs(totalSeconds) % 3600) / 60);
  const s = Math.abs(totalSeconds) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Round seconds UP to the nearest 15-minute (900s) interval */
function roundUpTo15Min(seconds: number): number {
  return Math.ceil(seconds / 900) * 900;
}

function getGuaranteedSeconds(hours?: string): number {
  const h = parseFloat(hours || "0");
  return h * 3600;
}

type GearCondition = "okay" | "iffy" | "broken";

// Virtual gear for jobs with no equipment
const VIRTUAL_PARENT: Asset = {
  id: "virtual-parent-yourself",
  asset_name: "Yourself",
  category: "Virtual",
  status: "available" as any,
  color_code: "#a78bfa",
  serial: "",
  quantity: 1,
};
const VIRTUAL_CHILDREN: Asset[] = [
  { id: "virtual-child-wits", asset_name: "Your wits", category: "", status: "available" as any, color_code: "#a78bfa", serial: "", parent_asset_id: "virtual-parent-yourself", quantity: 1 },
  { id: "virtual-child-intelligence", asset_name: "Your intelligence", category: "", status: "available" as any, color_code: "#a78bfa", serial: "", parent_asset_id: "virtual-parent-yourself", quantity: 1 },
  { id: "virtual-child-grammar", asset_name: "Your ability to differentiate between Your and You're", category: "", status: "available" as any, color_code: "#a78bfa", serial: "", parent_asset_id: "virtual-parent-yourself", quantity: 1 },
];
const ALL_VIRTUAL = [VIRTUAL_PARENT, ...VIRTUAL_CHILDREN];

function isVirtualAssetId(id: string) {
  return id.startsWith("virtual-");
}

function expandAssignedKitAssets(assignedAssetIds: string[] | null | undefined, allAssets: Asset[]): Asset[] {
  if (!assignedAssetIds?.length) return [];

  const assetById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const childrenByParent = new Map<string, Asset[]>();

  allAssets.forEach((asset) => {
    if (!asset.parent_asset_id) return;
    const siblings = childrenByParent.get(asset.parent_asset_id) ?? [];
    siblings.push(asset);
    childrenByParent.set(asset.parent_asset_id, siblings);
  });

  const expandedIds = new Set<string>();
  const queue = [...assignedAssetIds];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || expandedIds.has(currentId)) continue;

    const currentAsset = assetById.get(currentId);
    if (!currentAsset) continue;

    expandedIds.add(currentId);

    // If a child was assigned directly, include its parent.
    if (currentAsset.parent_asset_id && !expandedIds.has(currentAsset.parent_asset_id)) {
      queue.push(currentAsset.parent_asset_id);
    }

    // If a parent was assigned, include its full child kit.
    if (!currentAsset.parent_asset_id) {
      (childrenByParent.get(currentAsset.id) ?? []).forEach((child) => {
        if (!expandedIds.has(child.id)) queue.push(child.id);
      });
    }
  }

  const expandedAssets = [...expandedIds]
    .map((id) => assetById.get(id))
    .filter(Boolean) as Asset[];

  const expandedSet = new Set(expandedAssets.map((asset) => asset.id));
  const byName = (a: Asset, b: Asset) => (a.asset_name ?? "").localeCompare(b.asset_name ?? "");

  const roots = expandedAssets
    .filter((asset) => !asset.parent_asset_id || !expandedSet.has(asset.parent_asset_id))
    .sort(byName);

  const orderedAssets: Asset[] = [];
  const orderedIds = new Set<string>();

  roots.forEach((root) => {
    orderedAssets.push(root);
    orderedIds.add(root.id);

    (childrenByParent.get(root.id) ?? [])
      .filter((child) => expandedSet.has(child.id))
      .sort(byName)
      .forEach((child) => {
        orderedAssets.push(child);
        orderedIds.add(child.id);
      });
  });

  const leftovers = expandedAssets.filter((asset) => !orderedIds.has(asset.id)).sort(byName);
  return [...orderedAssets, ...leftovers];
}

export default function OperatorHome() {
  const navigate = useNavigate();
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const { data: assets, isLoading: assetsLoading } = useAssets();
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments();

  // Meemaw pieces currently borrowed by this operator
  const { data: borrowedPieces = [] } = useQuery({
    queryKey: ["meemaw_borrowed", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meemaw_kit_members" as any)
        .select("id, asset_id, shared_notes, shared_at, shared_job_id, kit_id")
        .eq("shared_out", true)
        .eq("shared_with_employee_id", employee!.id);
      if (error) throw error;
      return ((data as any) ?? []) as Array<{ id: string; asset_id: string; shared_notes: string | null; shared_at: string | null; shared_job_id: string | null; kit_id: string }>;
    },
    staleTime: 10000,
  });
  const { data: borrowedKits = [] } = useQuery({
    queryKey: ["meemaw_borrowed_kits", borrowedPieces.map((b) => b.kit_id).join(",")],
    enabled: borrowedPieces.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(borrowedPieces.map((b) => b.kit_id)));
      const { data, error } = await supabase.from("meemaw_kits" as any).select("id, name, emoji").in("id", ids);
      if (error) throw error;
      return ((data as any) ?? []) as Array<{ id: string; name: string; emoji: string | null }>;
    },
  });

  // Realtime: auto-refresh when jobs or assignments change (e.g. admin deletes a job)
  // Invalidate BOTH queries on either change — operator RLS requires assignment to exist before job is visible
  useEffect(() => {
    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
    };
    const channel = supabase
      .channel("operator-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, invalidateAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [cancelledOpen, setCancelledOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [selectedSheetSnapshot, setSelectedSheetSnapshot] = useState<CallSheetData | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedJobId = searchParams.get("job");

  const cloneCallSheetData = useCallback((sheet: CallSheetData): CallSheetData => ({
    job: { ...sheet.job },
    assignment: { ...sheet.assignment },
    assets: sheet.assets.map((asset) => ({ ...asset })),
  }), []);

  const clearDeepLinkedJobParam = useCallback(() => {
    if (!searchParams.has("job")) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("job");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const openJobDetail = useCallback((sheet: CallSheetData) => {
    clearDeepLinkedJobParam();
    setSelectedSheetSnapshot(cloneCallSheetData(sheet));
  }, [clearDeepLinkedJobParam, cloneCallSheetData]);

  const closeJobDetail = useCallback(() => {
    clearDeepLinkedJobParam();
    setSelectedSheetSnapshot(null);
  }, [clearDeepLinkedJobParam]);

  // Calendar state
  const [calView, setCalView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(new Date());

  // Push notification opt-in state
  const [pushStatus, setPushStatus] = useState<"loading" | "prompt" | "granted" | "denied">("loading");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushStatus("denied");
      return;
    }
    setPushStatus(Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "prompt");
  }, []);

  const handleEnablePush = async () => {
    if (!employee) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("denied");
        toast.error("Notification permission denied by browser");
        return;
      }
      setPushStatus("granted");

      const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!VAPID_PUBLIC_KEY) { toast.error("Push not configured – missing VAPID key"); return; }

      // Register SW and wait until it's fully active
      const registration = await navigator.serviceWorker.register("/sw.js");
      const ready = await navigator.serviceWorker.ready;

      let subscription = await ready.pushManager.getSubscription();
      if (!subscription) {
        // Convert URL-safe base64 VAPID key to Uint8Array
        const padding = "=".repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
        const base64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        const appServerKey = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) appServerKey[i] = rawData.charCodeAt(i);

        try {
          subscription = await ready.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey,
          });
        } catch (subErr: any) {
          console.error("[push] subscribe() failed:", subErr);
          toast.error(`Failed to subscribe: ${subErr?.message || String(subErr)}`);
          return;
        }
      }

      const { error } = await supabase
        .from("push_subscriptions" as any)
        .upsert({ employee_id: employee.id, subscription: subscription.toJSON() } as any, { onConflict: "employee_id" });

      if (error) {
        console.error("[push] Save failed:", error);
        toast.error(`Failed to save subscription: ${error.message}`);
      } else {
        toast.success("Push notifications enabled!");
      }
    } catch (err: any) {
      console.error("[push] Setup failed:", err);
      toast.error(`Notification setup failed: ${err?.message || String(err)}`);
    }
  };

  const isLoading = jobsLoading || assetsLoading || assignmentsLoading;

  const allSheets: CallSheetData[] = useMemo(() => {
    if (!employee || !jobs || !assets || !assignments) return [];
    const myAssignments = assignments.filter((a) => a.operator_id === employee.id);

    return myAssignments
      .map((assignment) => {
        const job = jobs.find((j) => j.id === assignment.job_id);
        if (!job) return null;

        const jobAssets = expandAssignedKitAssets(assignment.asset_ids, assets);
        // If no real gear assigned, inject virtual gear for the easter egg
        const effectiveAssets = jobAssets.length > 0 ? jobAssets : ALL_VIRTUAL;
        return { job, assets: effectiveAssets, assignment };
      })
      .filter(Boolean) as CallSheetData[];
  }, [employee, jobs, assets, assignments]);

  const selectedAssignmentId = selectedSheetSnapshot?.assignment.id ?? null;
  const detailSheet = useMemo(() => {
    if (!selectedAssignmentId) return null;
    return allSheets.find((sheet) => sheet.assignment.id === selectedAssignmentId) ?? selectedSheetSnapshot;
  }, [selectedAssignmentId, allSheets, selectedSheetSnapshot]);

  // Deep-link: open job detail from ?job=<id> query param (e.g. from notifications)
  useEffect(() => {
    if (!deepLinkedJobId || selectedSheetSnapshot) return;

    const nextSheet = allSheets.find((sheet) => sheet.job.id === deepLinkedJobId);
    if (!nextSheet) return;

    setSelectedSheetSnapshot(cloneCallSheetData(nextSheet));
    clearDeepLinkedJobParam();
  }, [allSheets, clearDeepLinkedJobParam, cloneCallSheetData, deepLinkedJobId, selectedSheetSnapshot]);

  const activeSheets = useMemo(() => allSheets.filter((s) => s.job.status !== "cancelled"), [allSheets]);
  const cancelledSheets = useMemo(() => allSheets.filter((s) => s.job.status === "cancelled"), [allSheets]);

  const filteredSheets = useMemo(() => {
    if (!selectedDate) return activeSheets;
    const selStr = format(selectedDate, "yyyy-MM-dd");
    return activeSheets.filter((s) => s.job.job_date === selStr);
  }, [activeSheets, selectedDate]);

  // Calendar days for schedule overview
  const calDays = useMemo(() => {
    if (calView === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 0 });
      const e = endOfWeek(anchor, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: s, end: e });
    } else {
      const s = startOfMonth(anchor);
      const e = endOfMonth(anchor);
      return eachDayOfInterval({ start: s, end: e });
    }
  }, [calView, anchor]);

  // Map MY jobs by date for the calendar pills
  const myJobsByDay = useMemo(() => {
    const map = new Map<string, CallSheetData[]>();
    activeSheets.forEach((s) => {
      if (!s.job.job_date) return;
      const key = s.job.job_date;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    });
    return map;
  }, [activeSheets]);

  const navPrev = () => setAnchor(calView === "week" ? subWeeks(anchor, 1) : subMonths(anchor, 1));
  const navNext = () => setAnchor(calView === "week" ? addWeeks(anchor, 1) : addMonths(anchor, 1));

  if (isLoading) return <OperatorSkeleton />;
  if (showArchive) return <OperatorArchive onBack={() => setShowArchive(false)} />;
  const firstName = employee?.name?.split(" ")[0] ?? "Operator";

    return (
    <div className="min-h-screen px-4 py-6 pb-20 max-w-5xl mx-auto space-y-6">
      <PendingMissionAlert sheets={activeSheets} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hello, {firstName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-technical">
            {activeSheets.length === 0
              ? "No jobs assigned."
              : `${activeSheets.length} job${activeSheets.length > 1 ? "s" : ""} on your call sheet.`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="gap-1 border-warning/30 text-warning font-bold text-sm px-2.5 py-1 shadow-[0_0_8px_hsl(var(--warning)/0.2)]">
            <Star className="h-3.5 w-3.5" /> {employee?.points ?? 0} pts
          </Badge>
          <Button size="sm" variant="outline" className="gap-1 text-xs border-muted-foreground/20" onClick={() => setShowArchive(true)}>
            <History className="h-3.5 w-3.5" /> Past Jobs
          </Button>
          {pushStatus === "prompt" && (
            <Button size="sm" variant="outline" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10" onClick={handleEnablePush}>
              <Bell className="h-4 w-4" />
            </Button>
          )}
          {pushStatus === "granted" && (
            <Badge variant="outline" className="gap-1 border-success/30 text-success">
              <Bell className="h-3 w-3" />
            </Badge>
          )}
        </div>
      </div>

      {/* ─── BIGGER Schedule Overview Calendar ─── */}
      <Card className="glass-card border-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" /> My Schedule
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <Button size="sm" variant={calView === "week" ? "default" : "ghost"} className="h-8 text-xs px-3" onClick={() => setCalView("week")}>Week</Button>
                <Button size="sm" variant={calView === "month" ? "default" : "ghost"} className="h-8 text-xs px-3" onClick={() => setCalView("month")}>Month</Button>
              </div>
              <Button size="icon" variant="ghost" aria-label="Previous period" className="h-8 w-8" onClick={navPrev}><ArrowLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-technical text-muted-foreground min-w-[120px] text-center font-medium">
                {calView === "week"
                  ? `${format(calDays[0], "MMM d")} – ${format(calDays[calDays.length - 1], "MMM d")}`
                  : format(anchor, "MMMM yyyy")
                }
              </span>
              <Button size="icon" variant="ghost" aria-label="Next period" className="h-8 w-8" onClick={navNext}><ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className={cn("grid gap-2", calView === "week" ? "grid-cols-7" : "grid-cols-7")}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-xs text-center text-muted-foreground font-semibold uppercase py-2">{d}</div>
            ))}
            {calView === "month" && Array.from({ length: calDays[0].getDay() }).map((_, i) => (
              <div key={`pad-${i}`} className="border border-transparent" />
            ))}
            {calDays.map((day) => {
              const dayStr = format(day, "yyyy-MM-dd");
              const daySheets = myJobsByDay.get(dayStr) ?? [];
              const isToday = format(new Date(), "yyyy-MM-dd") === dayStr;
              const isSelected = selectedDate && format(selectedDate, "yyyy-MM-dd") === dayStr;
              return (
                <div
                  key={dayStr}
                  className={cn(
                    "rounded-lg p-3 border transition-colors cursor-pointer",
                    calView === "week" ? "min-h-[140px]" : "min-h-[110px]",
                    isToday ? "border-primary/40 bg-primary/5" : "border-border/30 bg-background/30",
                    isSelected && "border-primary/60 bg-primary/10 ring-1 ring-primary/20",
                  )}
                  onClick={() => setSelectedDate(day)}
                >
                  <p className={cn(
                    "text-sm font-technical text-center mb-2",
                    isToday ? "text-primary font-bold" : "text-muted-foreground"
                  )}>
                    {format(day, "d")}
                  </p>
                  <div className="space-y-1">
                    {daySheets.slice(0, 3).map((s) => (
                      <button
                        key={s.job.id}
                        className={cn(
                          "w-full text-left rounded-md px-2 py-1.5 text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity leading-snug",
                          pillColors[s.job.status]
                        )}
                        onClick={(e) => { e.stopPropagation(); openJobDetail(s); }}
                        title={`${s.job.client_name} · ${s.job.call_time || ""}`}
                      >
                        <span className="block font-semibold">{s.job.client_name}</span>
                        {s.job.call_time && <span className="block text-[10px] opacity-80 mt-0.5">⏰ {s.job.call_time}</span>}
                        {s.job.address && <span className="block text-[10px] opacity-60 mt-0.5 line-clamp-1">📍 {s.job.address}</span>}
                      </button>
                    ))}
                    {daySheets.length > 3 && (
                      <p className="text-[9px] text-muted-foreground text-center">+{daySheets.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {borrowedPieces.length > 0 && (
        <Card className="glass-card border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Package className="h-5 w-5 text-amber-500" /> Borrowed Meemaw Pieces
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <p className="text-xs text-muted-foreground">
              Components on loan to you from a kit. Bring them back when you're done.
            </p>
            {borrowedPieces.map((b) => {
              const a = assets?.find((x) => x.id === b.asset_id);
              const kit = borrowedKits.find((k) => k.id === b.kit_id);
              return (
                <div key={b.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-background/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a?.asset_name ?? "Unknown asset"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {kit ? `${kit.emoji ?? "👵"} ${kit.name}` : "From a Meemaw kit"}
                      {b.shared_notes && ` · ${b.shared_notes}`}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-500 shrink-0">On loan</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {selectedDate && (
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider font-technical">
            {format(selectedDate, "EEEE, MMM d")} — {filteredSheets.length} job{filteredSheets.length !== 1 ? "s" : ""}
          </p>
        )}
        {filteredSheets.map((sheet, i) => (
          <CallSheetCard key={sheet.job.id} sheet={sheet} index={i} onOpen={() => openJobDetail(sheet)} />
        ))}
      </div>

      {filteredSheets.length === 0 && (
        <div className="text-center py-12">
          <CalendarIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No jobs on this date.</p>
        </div>
      )}

      {cancelledSheets.length > 0 && (
        <Collapsible open={cancelledOpen} onOpenChange={setCancelledOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Jobs that never happened ({cancelledSheets.length})
              </span>
              {cancelledOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-2">
            {cancelledSheets.map((sheet, i) => (
              <CallSheetCard key={sheet.job.id} sheet={sheet} index={i} cancelled />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* SMS Preferences */}
      <SmsOptInCard />

      {selectedSheetSnapshot && detailSheet && (
        <JobDetailDialog
          key={detailSheet.assignment.id}
          sheet={detailSheet}
          open={!!selectedSheetSnapshot}
          onClose={closeJobDetail}
        />
      )}
    </div>
  );
}

/* ─── Call Sheet Card ─── */
function CallSheetCard({ sheet, index, onOpen, cancelled }: { sheet: CallSheetData; index: number; onOpen?: () => void; cancelled?: boolean }) {
  const { job, assignment } = sheet;
  const isClockedIn = !!assignment.actual_start_time && !assignment.actual_end_time;
  const isCompleted = !!assignment.actual_end_time;
  const isPending = !assignment.actual_start_time;

  // Status-based card styles
  const cardStateClass = cancelled
    ? "opacity-50"
    : isCompleted
      ? "border-destructive/50 bg-destructive/5"
      : isClockedIn
        ? "border-success/60 shadow-[0_0_20px_hsl(142_71%_45%/0.3)]"
        : "border-warning/40 bg-warning/5";

  const headerBgClass = isCompleted
    ? "bg-destructive/10 border-destructive/30"
    : isClockedIn
      ? "bg-success/10 border-success/30"
      : "bg-warning/10 border-warning/30";

  return (
    <motion.div custom={index} variants={fadeUp} initial="hidden" animate="show">
      <Card
        className={cn("glass-card overflow-hidden cursor-pointer hover:brightness-110 transition-all", cardStateClass)}
        onClick={onOpen}
      >
        <div className={cn("border-b px-4 py-3 flex items-center justify-between", headerBgClass)}>
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 text-primary shrink-0" />
            <span className="font-semibold text-foreground truncate">{job.client_name}</span>
            {isClockedIn && (
              <Badge className="bg-success/20 text-success border-success/30 text-[10px] glow-success">
                <Play className="h-3 w-3 mr-1" /> LIVE
              </Badge>
            )}
            {isCompleted && (
              <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">
                <CheckCircle2 className="h-3 w-3 mr-1" /> DONE
              </Badge>
            )}
            {isPending && (
              <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">
                <Clock className="h-3 w-3 mr-1" /> PENDING
              </Badge>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] border-primary/20 text-muted-foreground">
            {job.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {job.call_time && <DetailCell icon={<Clock className="h-3.5 w-3.5" />} label="Call Time" value={job.call_time} />}
            {job.job_date && <DetailCell icon={<CalendarIcon className="h-3.5 w-3.5" />} label="Date" value={format(parseISO(job.job_date + "T12:00:00"), "EEE, MMM d")} />}
            {job.location_type && <DetailCell icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={job.location_type} />}
            {job.guaranteed_hours && <DetailCell icon={<Timer className="h-3.5 w-3.5" />} label="Guaranteed" value={`${job.guaranteed_hours}h`} />}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function DetailCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md glass-card p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-sm font-semibold text-foreground font-technical">{value}</p>
    </div>
  );
}

/* ─── Live Timer Hook ─── */
function useLiveTimer(startTime?: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    const start = new Date(startTime).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  return elapsed;
}

// Export for sidebar usage
export { useLiveTimer, formatTimer, getGuaranteedSeconds };
export type { CallSheetData };

/* ─── Job Detail + Gear Checkout Dialog ─── */
function JobDetailDialog({ sheet, onClose, open }: { sheet: CallSheetData; onClose: () => void; open: boolean }) {
  const { job, assets: assignedAssets, assignment } = sheet;

  // Ensure body styles are cleaned up when dialog unmounts (Radix can leave overflow:hidden stuck)
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    };
  }, []);
  const { employee } = useAuth();
  const navigate = useNavigate();
  const updateAssignment = useUpdateAssignment();
  const updateAssetStatus = useUpdateAssetStatus();
  const updateAsset = useUpdateAsset();
  const createNotification = useCreateAdminNotification();
  const createLostItem = useCreateLostItem();
  const updateJobStatus = useUpdateJobStatus();
  const { data: lostItems = [] } = useLostItems();

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [liabilityAccepted, setLiabilityAccepted] = useState(false);
  const [showLiability, setShowLiability] = useState(false);
  const [showTardy, setShowTardy] = useState(false);
  const [tardySent, setTardySent] = useState(false);
  const [showHunger, setShowHunger] = useState(false);
  const [hungerDismissed, setHungerDismissed] = useState(false);
  const [showEditTimes, setShowEditTimes] = useState(false);
  const [showClockOutReport, setShowClockOutReport] = useState(false);
  const [showOverachiever, setShowOverachiever] = useState(false);
  const [endOfDayNotes, setEndOfDayNotes] = useState("");
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [gearCheckedOut, setGearCheckedOut] = useState(false);
  const [showMissingGearWarning, setShowMissingGearWarning] = useState(false);
  const [missingGearSummary, setMissingGearSummary] = useState<string[]>([]);
  const [showNeedsPrepWarning, setShowNeedsPrepWarning] = useState(false);
  const [showMissionAccept, setShowMissionAccept] = useState(false);
  const missionAcceptSessionKey = `mission_shown_${assignment.id}`;
  const [missionAcceptShown, setMissionAcceptShown] = useState(() => {
    return assignment.mission_accepted === true || sessionStorage.getItem(missionAcceptSessionKey) === "1";
  });
  const [showWhoopsMissing, setShowWhoopsMissing] = useState(false);
  const [whoopsMissingItems, setWhoopsMissingItems] = useState<{ asset: Asset; parentAsset?: Asset }[]>([]);
  const [missingBannerDismissed, setMissingBannerDismissed] = useState(false);

  // Active Mission state
  // Heal confirmation for previously damaged gear
  const [healAsset, setHealAsset] = useState<Asset | null>(null);
  const [healLoading, setHealLoading] = useState(false);

  const [liveNoteText, setLiveNoteText] = useState("");
  const [showReportBrokenGear, setShowReportBrokenGear] = useState(false);
  const [brokenGearId, setBrokenGearId] = useState("");
  const [brokenGearNotes, setBrokenGearNotes] = useState("");
  const [brokenGearQty, setBrokenGearQty] = useState(1);
  const [showTrafficConsent, setShowTrafficConsent] = useState(false);
  const [showGearStillOut, setShowGearStillOut] = useState(false);
  const [trafficSending, setTrafficSending] = useState(false);

  useEffect(() => {
    if (assignment.mission_accepted !== true) return;

    setMissionAcceptShown(true);
    setShowMissionAccept(false);
    sessionStorage.setItem(missionAcceptSessionKey, "1");
  }, [assignment.mission_accepted, missionAcceptSessionKey]);

  // Show mission acceptance popup ONCE if not yet accepted
  useEffect(() => {
    if (
      missionAcceptShown ||
      assignment.mission_accepted !== false ||
      assignment.actual_start_time ||
      job.status === "cancelled" ||
      job.status === "completed"
    ) {
      return;
    }

    setShowMissionAccept(true);
    setMissionAcceptShown(true);
    sessionStorage.setItem(missionAcceptSessionKey, "1");
  }, [assignment.mission_accepted, assignment.actual_start_time, job.status, missionAcceptShown, missionAcceptSessionKey]);

  // Track whether gear was already checked out (from assignment state)
  const hasCheckedOutGear = gearCheckedOut || (assignedAssets.length > 0 && assignedAssets.some(a => a.status === "checked_out"));

  // Gear condition tracking
  const [gearConditions, setGearConditions] = useState<Record<string, GearCondition>>({});
  const [gearNotes, setGearNotes] = useState<Record<string, string>>({});
  // Quantity dial for commodity children: key = asset.id, value = actual count operator has
  const [gearQuantities, setGearQuantities] = useState<Record<string, number>>({});

  // Separate modes: gear flow vs time flow
  const [gearMode, setGearMode] = useState<"view" | "checkout" | "checkin">("view");

  const setCondition = (id: string, condition: GearCondition) => {
    setGearConditions((prev) => ({ ...prev, [id]: condition }));
    if (condition === "okay") {
      setGearNotes((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handleHealConfirm = async () => {
    if (!healAsset) return;
    setHealLoading(true);
    try {
      await updateAsset.mutateAsync({ id: healAsset.id, status: "available", damage_notes: "" });
      // Also remove from sea_of_lost_items if present
      await supabase.from("sea_of_lost_items").delete().eq("parent_asset_id", healAsset.id);
      // Un-block the item in local state
      setCheckedIds((prev) => new Set(prev).add(healAsset.id));
      setGearConditions((prev) => ({ ...prev, [healAsset.id]: "okay" }));
      toast.success(`✅ ${healAsset.asset_name} marked as available!`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update asset");
    } finally {
      setHealLoading(false);
      setHealAsset(null);
    }
  };

  const setOperationalJobStatus = async (status: "ready_for_takeoff" | "launched" | "pending_sign_off") => {
    if (employee?.role === "operator") {
      const { error } = await (supabase as any).rpc("operator_set_job_status", {
        _job_id: job.id,
        _status: status,
      });
      if (error) throw error;
      return;
    }

    await updateJobStatus.mutateAsync({ id: job.id, status });
  };

  const isClockedIn = !!assignment.actual_start_time && !assignment.actual_end_time;
  const isCompleted = !!assignment.actual_end_time;

  const elapsed = useLiveTimer(isClockedIn ? assignment.actual_start_time : undefined);
  const guaranteedSecs = getGuaranteedSeconds(job.guaranteed_hours);
  const remaining = guaranteedSecs - elapsed;
  const isOT = guaranteedSecs > 0 && remaining <= 0;
  const isOTWarning = guaranteedSecs > 0 && remaining > 0 && remaining <= 1800;
  const otSeconds = isOT ? Math.abs(remaining) : 0;
  const otIncrements = Math.ceil(otSeconds / 900);

  // 6-hour hunger check
  useEffect(() => {
    if (!assignment.actual_start_time || assignment.actual_end_time) return;
    if (hungerDismissed || showHunger || assignment.lunch_check_response) return;
    if (elapsed >= 6 * 3600) setShowHunger(true);
  }, [elapsed, hungerDismissed, showHunger, assignment.lunch_check_response, assignment.actual_start_time, assignment.actual_end_time]);

  const handleHungerResponse = async (response: string) => {
    setHungerDismissed(true);
    setShowHunger(false);
    await updateAssignment.mutateAsync({
      id: assignment.id,
      lunch_check_response: response,
      lunch_check_time: new Date().toISOString(),
    });
    toast.success("Lunch check recorded!");
  };

  // Build parent-child hierarchy from expanded kit assets
  const hierarchy = useMemo(() => {
    const assetById = new Map(assignedAssets.map((asset) => [asset.id, asset]));
    const childMap = new Map<string, Asset[]>();
    const roots: Asset[] = [];

    assignedAssets.forEach((asset) => {
      if (asset.parent_asset_id && assetById.has(asset.parent_asset_id)) {
        const siblings = childMap.get(asset.parent_asset_id) ?? [];
        siblings.push(asset);
        childMap.set(asset.parent_asset_id, siblings);
        return;
      }
      roots.push(asset);
    });

    const byName = (a: Asset, b: Asset) => (a.asset_name ?? "").localeCompare(b.asset_name ?? "");
    roots.sort(byName);
    childMap.forEach((children, parentId) => {
      childMap.set(parentId, [...children].sort(byName));
    });

    return {
      roots,
      childMap,
      renderedIds: new Set(assignedAssets.map((asset) => asset.id)),
    };
  }, [assignedAssets]);

  const allAssetIds = useMemo(() => new Set(hierarchy.renderedIds), [hierarchy]);
  // Exclude broken/missing assets from the checkable set — they can't be selected
  const checkableAssetIds = useMemo(() => {
    const set = new Set<string>();
    assignedAssets.forEach((a) => {
      if (a.status !== "broken" && a.status !== "missing") set.add(a.id);
    });
    return set;
  }, [assignedAssets]);

  const toggleId = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        const children = hierarchy.childMap.get(id) ?? [];
        children.forEach(c => next.delete(c.id));
      } else {
        next.add(id);
        const children = hierarchy.childMap.get(id) ?? [];
        children.forEach(c => {
          // Skip broken/missing children
          if (c.status !== "broken" && c.status !== "missing") next.add(c.id);
        });
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    // "Select All (I'm in a hurry)" triggers liability modal
    setShowLiability(true);
  };

  const handleLiabilityAcceptAndSelectAll = () => {
    setCheckedIds(new Set(checkableAssetIds));
    // Set all conditions to okay and all quantities to expected
    const newConditions: Record<string, GearCondition> = {};
    const newQuantities: Record<string, number> = {};
    assignedAssets.forEach((a) => {
      if (a.status === "broken" || a.status === "missing") return;
      newConditions[a.id] = "okay";
      if (a.parent_asset_id) newQuantities[a.id] = a.quantity ?? 1;
    });
    setGearConditions(newConditions);
    setGearQuantities(newQuantities);
    setLiabilityAccepted(true);
    setShowLiability(false);
  };

  const allChecked = checkableAssetIds.size > 0 && checkedIds.size >= checkableAssetIds.size;

  // Track unchecked assets for red highlighting
  const [showUncheckedWarning, setShowUncheckedWarning] = useState(false);
  const uncheckedIds = useMemo(() => {
    const missing = new Set<string>();
    checkableAssetIds.forEach((id) => { if (!checkedIds.has(id)) missing.add(id); });
    return missing;
  }, [checkableAssetIds, checkedIds]);

  // Date-specific: only flag assets as "already out" if they're checked out for a job on the SAME date
  const { data: allAssignmentsForDateCheck } = useAssignments();
  const { data: allJobsForDateCheck } = useJobs();
  const alreadyCheckedOutIds = useMemo(() => {
    if (!allAssignmentsForDateCheck || !allJobsForDateCheck || !job.job_date) return new Set<string>();
    const thisJobDate = job.job_date;
    // Find all OTHER jobs on the same date
    const otherJobIdsOnDate = new Set(
      allJobsForDateCheck
        .filter((j) => j.job_date === thisJobDate && j.id !== job.id && j.status !== "cancelled")
        .map((j) => j.id)
    );
    // Collect asset IDs assigned to those other same-date jobs
    const out = new Set<string>();
    allAssignmentsForDateCheck.forEach((a) => {
      if (otherJobIdsOnDate.has(a.job_id) && a.asset_ids) {
        a.asset_ids.forEach((id) => out.add(id));
      }
    });
    return out;
  }, [assignedAssets, job, allAssignmentsForDateCheck, allJobsForDateCheck]);

  const isLate = useMemo(() => {
    if (!job.call_time) return false;
    const now = new Date();
    const [h, m] = job.call_time.split(":").map(Number);
    if (isNaN(h)) return false;
    const callDate = job.job_date ? new Date(job.job_date + "T00:00:00") : new Date();
    callDate.setHours(h, m || 0, 0, 0);
    return now > callDate;
  }, [job]);

  // Check if more than 30min early
  const isTooEarly = useMemo(() => {
    if (!job.call_time) return false;
    const now = new Date();
    const [h, m] = job.call_time.split(":").map(Number);
    if (isNaN(h)) return false;
    const callDate = job.job_date ? new Date(job.job_date + "T00:00:00") : new Date();
    callDate.setHours(h, m || 0, 0, 0);
    const diffMs = callDate.getTime() - now.getTime();
    return diffMs > 30 * 60 * 1000;
  }, [job]);

  const handleStartGearCheckout = () => {
    // Intercept: if job is still "needs_prep", show warning
    if (job.status === "needs_prep") {
      setShowNeedsPrepWarning(true);
      return;
    }
    proceedToCheckout();
  };

  const proceedToCheckout = () => {
    if (isLate && !tardySent) { setShowTardy(true); return; }
    navigateToCheckout();
  };

  const navigateToCheckout = () => {
    setGearMode("checkout");
    setCheckedIds(new Set());
    setGearConditions({});
    setGearNotes({});
    setGearQuantities({});
    setShowUncheckedWarning(false);
  };

  const handleTardyAcknowledge = async () => {
    if (!employee) return;
    await createNotification.mutateAsync({
      operator_id: employee.id, job_id: job.id, notification_type: "tardy",
      message: `${employee.name} is running late for job ${job.job_number || job.client_name}`,
    });
    setTardySent(true); setShowTardy(false); navigateToCheckout();
    toast.info("Your manager has been notified.");
  };

  // GEAR CHECKOUT — does NOT start the clock
  const handleGearCheckoutConfirm = async () => {
    // Ensure every child asset has a condition selected (default is okay, but verify)
    const childIds = assignedAssets.filter((a) => a.parent_asset_id).map((a) => a.id);
    const missingCondition = childIds.filter((id) => checkedIds.has(id) && !gearConditions[id]);
    if (missingCondition.length > 0) {
      const newConditions = { ...gearConditions };
      missingCondition.forEach((id) => { newConditions[id] = "okay"; });
      setGearConditions(newConditions);
    }

    if (!liabilityAccepted) { setShowLiability(true); return; }

    for (const [id, condition] of Object.entries(gearConditions)) {
      if (checkedIds.has(id) && (condition === "iffy" || condition === "broken") && !gearNotes[id]?.trim()) {
        toast.error("Please describe the damage for all flagged items.");
        return;
      }
    }

    // Check for unchecked items — these will be marked missing
    const uncheckedItems: { asset: Asset; parentAsset?: Asset }[] = [];
    for (const a of assignedAssets) {
      if (a.status === "broken" || a.status === "missing") continue; // already flagged
      if (!checkedIds.has(a.id)) {
        const parentAsset = a.parent_asset_id ? assignedAssets.find(p => p.id === a.parent_asset_id) : undefined;
        uncheckedItems.push({ asset: a, parentAsset });
      }
    }

    if (uncheckedItems.length > 0) {
      setWhoopsMissingItems(uncheckedItems);
      setShowWhoopsMissing(true);
      return;
    }

    // Pre-submit interceptor: check for missing quantities or broken/iffy items
    const flaggedItems: string[] = [];
    for (const a of assignedAssets) {
      if (!a.parent_asset_id) continue; // only check children
      if (!checkedIds.has(a.id)) continue;
      const condition = gearConditions[a.id] ?? "okay";
      const expectedQty = a.quantity ?? 1;
      const actualQty = gearQuantities[a.id] ?? expectedQty;
      if (actualQty < expectedQty) {
        flaggedItems.push(`${a.asset_name} (${actualQty}/${expectedQty} — missing ${expectedQty - actualQty})`);
      }
      if (condition === "broken") {
        flaggedItems.push(`${a.asset_name} (Broken)`);
      } else if (condition === "iffy") {
        flaggedItems.push(`${a.asset_name} (Iffy)`);
      }
    }
    // Also check parent-level conditions
    for (const a of assignedAssets) {
      if (a.parent_asset_id) continue;
      if (!checkedIds.has(a.id)) continue;
      const condition = gearConditions[a.id] ?? "okay";
      if (condition === "broken") flaggedItems.push(`${a.asset_name} (Broken)`);
      else if (condition === "iffy") flaggedItems.push(`${a.asset_name} (Iffy)`);
    }

    if (flaggedItems.length > 0) {
      setMissingGearSummary(flaggedItems);
      setShowMissingGearWarning(true);
      return;
    }

    // Clean path — no issues, submit directly
    await executeGearCheckout();
  };

  const handleWhoopsMissingConfirm = async () => {
    setShowWhoopsMissing(false);
    // Log all unchecked items as missing in Sea of Lost Items
    for (const { asset, parentAsset } of whoopsMissingItems) {
      if (isVirtualAssetId(asset.id)) continue;
      await createLostItem.mutateAsync({
        item_name: asset.asset_name,
        missing_quantity: asset.quantity ?? 1,
        condition: "missing",
        parent_rig_name: parentAsset?.asset_name ?? asset.asset_name,
        parent_asset_id: asset.parent_asset_id,
        job_id: job.id,
        operator_id: employee?.id,
        notes: `Operator did not check off during checkout on ${new Date().toLocaleDateString()}`,
      });
      // Mark asset as missing
      if (!isVirtualAssetId(asset.id)) {
        await updateAssetStatus.mutateAsync({ id: asset.id, status: "missing" });
      }
    }
    toast.warning(`⚠ ${whoopsMissingItems.length} item(s) logged as missing.`);
    // Now proceed with checkout for checked items
    await executeGearCheckout();
  };

  const executeGearCheckout = async () => {
    // Update asset statuses and damage notes — skip virtual assets
    for (const id of checkedIds) {
      if (isVirtualAssetId(id)) continue; // Don't write virtual items to DB
      const asset = assignedAssets.find((a) => a.id === id);
      if (!asset) continue;
      const condition = gearConditions[id] ?? "okay";

      // Handle ALL child asset shrinkage (not just commodity)
      if (asset.parent_asset_id) {
        const expectedQty = asset.quantity ?? 1;
        const actualQty = gearQuantities[id] ?? expectedQty;
        const shortage = expectedQty - actualQty;

        if (shortage > 0) {
          const { error: qErr } = await supabase.from("assets").update({ quantity: actualQty }).eq("id", id);
          if (qErr) { toast.error(`Failed to update quantity: ${qErr.message}`); return; }
        }

        // Auto-log missing items to Sea of Lost Items
        if (shortage > 0 || condition === "broken" || condition === "iffy") {
          const parent = assignedAssets.find((a) => a.id === asset.parent_asset_id);
          const lostCondition = shortage > 0 ? "missing" : condition;

          await createLostItem.mutateAsync({
            item_name: asset.asset_name,
            missing_quantity: shortage > 0 ? shortage : 1,
            condition: lostCondition,
            parent_rig_name: parent?.asset_name ?? "Unknown Rig",
            parent_asset_id: asset.parent_asset_id,
            job_id: job.id,
            operator_id: employee?.id,
            notes: shortage > 0
              ? `Auto-logged during checkout on ${new Date().toLocaleDateString()}`
              : gearNotes[id],
          });

          if (shortage > 0) {
            toast.warning(`⚠ ${shortage}x ${asset.asset_name} logged as missing.`);
          }

          // Ping the last operator who had this asset
          if (shortage > 0 && employee) {
            try {
              const { data: prevAssignments } = await supabase
                .from("assignments")
                .select("operator_id, job_id")
                .not("actual_end_time", "is", null)
                .contains("asset_ids", [asset.parent_asset_id || id])
                .neq("job_id", job.id)
                .order("actual_end_time", { ascending: false })
                .limit(1);

              if (prevAssignments && prevAssignments.length > 0) {
                const prevOp = prevAssignments[0];
                const { data: prevEmployee } = await supabase
                  .from("employees")
                  .select("id, name, email")
                  .eq("id", prevOp.operator_id)
                  .single();

                if (prevEmployee) {
                  // Write notification
                  await supabase.from("admin_notifications").insert({
                    notification_type: "missing_item_ping",
                    operator_id: prevEmployee.id,
                    job_id: prevOp.job_id,
                    message: `Hey ${prevEmployee.name} — ${shortage}x ${asset.asset_name} is missing from ${parent?.asset_name ?? "a kit"}. Have you seen it? (No worries if not, just checking in)`,
                    recipient_role: "operator",
                    recipient_id: prevEmployee.id,
                  });

                  // Send email to previous operator
                  if (prevEmployee.email) {
                    try {
                      await supabase.functions.invoke("send-job-emails", {
                        body: {
                          emails: [{
                            type: "missing_item_ping",
                            to: prevEmployee.email,
                            recipientName: prevEmployee.name,
                            jobDetails: {
                              jobNumber: job.job_number || "",
                              clientName: job.client_name,
                              jobDate: job.job_date,
                              itemName: asset.asset_name,
                              quantity: shortage,
                              operatorName: employee.name,
                              assetName: parent?.asset_name ?? "a kit",
                            },
                          }],
                        },
                      });
                    } catch { /* skip email errors silently */ }
                  }
                }
              }
            } catch { /* skip ping errors silently */ }
          }
        }
      }

      if (condition === "broken") {
        await updateAsset.mutateAsync({ id, status: "broken", damage_notes: gearNotes[id] ?? "" });
      } else if (condition === "iffy") {
        await updateAsset.mutateAsync({ id, status: "iffy", damage_notes: gearNotes[id] ?? "" });
      } else {
        await updateAssetStatus.mutateAsync({ id, status: "checked_out" });
      }
    }
    // Auto-update job status to "ready_for_takeoff" (checkout done, NOT clocked in yet)
    await setOperationalJobStatus("ready_for_takeoff");
    setGearCheckedOut(true);
    setGearMode("view");
    setShowUncheckedWarning(false);

    // 📍 Capture GPS breadcrumb (best-effort) and save to assignment
    try {
      const { tryGetCurrentMapsUrl } = await import("@/lib/geofence");
      const url = await tryGetCurrentMapsUrl();
      if (url) {
        await updateAssignment.mutateAsync({ id: assignment.id, checkout_location_url: url });
      }
    } catch { /* breadcrumb is best-effort */ }

    // Notify admins about gear checkout
    if (employee?.id && job.id) {
      const assetNames = assignedAssets.filter(a => !isVirtualAssetId(a.id)).map(a => a.asset_name).filter(Boolean).slice(0, 3).join(", ");
      const suffix = assignedAssets.filter(a => !isVirtualAssetId(a.id)).length > 3 ? ` +${assignedAssets.filter(a => !isVirtualAssetId(a.id)).length - 3} more` : "";
      await createNotification.mutateAsync({
        operator_id: employee.id,
        job_id: job.id,
        notification_type: "gear_checkout",
        recipient_role: "manager",
        title: "Gear Checked Out 📦",
        message: `${employee.name ?? "Operator"} has checked out gear for ${job.client_name ?? "a job"}: ${assetNames}${suffix}`,
      });
    }
    toast.success("Gear checked out — Ready for Takeoff! Hit Clock In when you're ready.");
  };

  // Check if all gear is virtual (no real assets)
  const isAllVirtualGear = useMemo(() => assignedAssets.every(a => isVirtualAssetId(a.id)), [assignedAssets]);

  const handleGearCheckinConfirm = async () => {
    if (!allChecked) {
      setShowUncheckedWarning(true);
      toast.error("You must check in every parent and child item before completing return.");
      return;
    }

    for (const [id, condition] of Object.entries(gearConditions)) {
      if ((condition === "iffy" || condition === "broken") && !gearNotes[id]?.trim()) {
        toast.error("Please describe the damage for all flagged items.");
        return;
      }
    }

    for (const id of allAssetIds) {
      if (isVirtualAssetId(id)) continue; // Skip virtual gear
      const condition = gearConditions[id] ?? "okay";
      if (condition === "broken") {
        await updateAsset.mutateAsync({ id, status: "broken", damage_notes: gearNotes[id] ?? "" });
      } else if (condition === "iffy") {
        await updateAsset.mutateAsync({ id, status: "iffy", damage_notes: gearNotes[id] ?? "" });
      } else {
        await updateAssetStatus.mutateAsync({ id, status: "available" });
      }
    }

    // 📍 Capture GPS breadcrumb (best-effort) and save to assignment
    try {
      const { tryGetCurrentMapsUrl } = await import("@/lib/geofence");
      const url = await tryGetCurrentMapsUrl();
      if (url) {
        await updateAssignment.mutateAsync({ id: assignment.id, checkin_location_url: url });
      }
    } catch { /* breadcrumb is best-effort */ }

    // Auto-update job status to "pending_sign_off"
    await setOperationalJobStatus("pending_sign_off");
    setGearMode("view");
    setShowUncheckedWarning(false);
    toast.success("Gear returned — Pending Admin Sign-Off!");
  };

  // CLOCK IN — separate from gear checkout
  const handleStartClock = () => {
    if (isTooEarly) {
      setShowOverachiever(true);
      return;
    }
    runGeofenceThenClockIn();
  };

  const [geofenceBlocker, setGeofenceBlocker] = useState<{ distance: number } | null>(null);
  const [geofenceChecking, setGeofenceChecking] = useState(false);

  const runGeofenceThenClockIn = async () => {
    if (!job.address) {
      // No address to fence against — clock in normally
      doClockIn();
      return;
    }
    setGeofenceChecking(true);
    try {
      const [{ haversineMiles, getCurrentCoords, geocodeAddress }] = await Promise.all([
        import("@/lib/geofence"),
      ]);
      const here = await getCurrentCoords();
      const venue = await geocodeAddress(job.address);
      if (!venue) {
        // Fail open: couldn't geocode the address — clock in normally
        doClockIn();
        return;
      }
      const distance = haversineMiles(here.lat, here.lng, venue.lat, venue.lng);
      if (distance > 0.5) {
        setGeofenceBlocker({ distance });
        return;
      }
      doClockIn();
    } catch (err: any) {
      // Permission denied or timeout — clock in normally so we don't trap operators
      console.warn("Geofence check skipped:", err?.message);
      doClockIn();
    } finally {
      setGeofenceChecking(false);
    }
  };

  const doClockIn = async (opts?: { geofenceFlagged?: boolean; distanceMiles?: number }) => {
    await updateAssignment.mutateAsync({
      id: assignment.id,
      actual_start_time: new Date().toISOString(),
      ...(opts?.geofenceFlagged
        ? { geofence_flagged: true, geofence_distance_miles: opts.distanceMiles ?? null }
        : {}),
    });
    await setOperationalJobStatus("launched");
    toast.success("Clocked in — Job Launched!");

    // Auto-resolve: clear any active traffic_delay notifications for this job
    try {
      await supabase
        .from("admin_notifications")
        .delete()
        .eq("job_id", job.id)
        .eq("notification_type", "traffic_delay");
    } catch { /* skip silently */ }

    // Send "They're Here" notification to managers
    try {
      await supabase.from("admin_notifications").insert({
        notification_type: "theyre_here",
        operator_id: employee.id,
        job_id: job.id,
        title: "They're HEEEEeeerre! 🎉",
        message: `${employee.name} just clocked in for ${job.client_name || job.job_number} — the crew has arrived!`,
        recipient_role: "manager",
      } as any);
    } catch { /* skip silently */ }

    // Send cute "They're Here" email to client
    try {
      const { data: clientData } = await supabase
        .from("clients")
        .select("email, contact_name, company_name")
        .eq("company_name", job.client_name || "")
        .maybeSingle();

      const emailsToSend: any[] = [];

      if (clientData?.email) {
        emailsToSend.push({
          type: "theyre_here",
          to: clientData.email,
          recipientName: clientData.contact_name || clientData.company_name || "there",
          jobDetails: {
            jobNumber: job.job_number || "",
            clientName: job.client_name || "",
            jobDate: job.job_date || "",
            callTime: job.call_time || "",
            operatorName: employee.name || "Your crew",
          },
        });
      }

      if (emailsToSend.length > 0) {
        await supabase.functions.invoke("send-job-emails", {
          body: { emails: emailsToSend },
        });
      }
    } catch { /* skip email errors silently */ }
  };

  // Undo clock-out: set end time back to null
  const handleUndoClockOut = async () => {
    await updateAssignment.mutateAsync({ id: assignment.id, actual_end_time: null });
    toast.success("Clock-out undone — you're back on the clock!");
  };

  const handleClockOutRequest = () => {
    // Check if any assigned gear is still checked out
    const gearStillOut = assignedAssets.some(a => !isVirtualAssetId(a.id) && a.status === "checked_out");
    if (gearStillOut) {
      setShowGearStillOut(true);
      return;
    }
    setShowClockOutReport(true);
  };

  const handleClockOutConfirm = async () => {
    if (!endOfDayNotes.trim()) {
      toast.error("Please leave a note before clocking out.");
      return;
    }

    for (const [id, condition] of Object.entries(gearConditions)) {
      if ((condition === "iffy" || condition === "broken") && !gearNotes[id]?.trim()) {
        toast.error("Please describe the damage for all flagged items.");
        return;
      }
    }

    // Round clock-out time UP to the nearest 15-minute interval from clock-in
    const now = new Date();
    const start = assignment.actual_start_time ? new Date(assignment.actual_start_time) : now;
    const rawSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
    const roundedSeconds = roundUpTo15Min(rawSeconds);
    const roundedEnd = new Date(start.getTime() + roundedSeconds * 1000);

    await updateAssignment.mutateAsync({
      id: assignment.id,
      actual_end_time: roundedEnd.toISOString(),
      end_of_day_notes: endOfDayNotes,
      expense_amount: expenseAmount > 0 ? expenseAmount : undefined,
      receipt_urls: receiptUrls.length > 0 ? receiptUrls : undefined,
    } as any);

    // Update asset statuses on return
    for (const id of checkedIds.size > 0 ? checkedIds : allAssetIds) {
      if (isVirtualAssetId(id)) continue; // Skip virtual gear
      const condition = gearConditions[id] ?? "okay";
      if (condition === "broken") {
        await updateAsset.mutateAsync({ id, status: "broken", damage_notes: gearNotes[id] ?? "" });
      } else if (condition === "iffy") {
        await updateAsset.mutateAsync({ id, status: "iffy", damage_notes: gearNotes[id] ?? "" });
      } else {
        await updateAssetStatus.mutateAsync({ id, status: "available" });
      }
    }

    // Auto-transition job to pending_sign_off for admin sign-off
    await setOperationalJobStatus("pending_sign_off");

    toast.success("Clocked out — Pending Admin Sign-Off!");
    setShowClockOutReport(false);
    onClose();
  };

  const totalTimeRaw = assignment.actual_start_time && assignment.actual_end_time
    ? differenceInSeconds(new Date(assignment.actual_end_time), new Date(assignment.actual_start_time))
    : null;
  const totalTime = totalTimeRaw !== null ? roundUpTo15Min(totalTimeRaw) : null;

  const conditionClass = (condition: GearCondition) => {
    if (condition === "iffy") return "border-warning/50 text-warning";
    if (condition === "broken") return "border-destructive/50 text-destructive";
    return "";
  };

  const renderGearItem = (asset: Asset, isChild = false, parentId?: string) => {
    const condition = gearConditions[asset.id] ?? "okay";
    const isUnchecked = showUncheckedWarning && uncheckedIds.has(asset.id);
    const isAlreadyOut = alreadyCheckedOutIds.has(asset.id) && gearMode === "checkout" && !gearCheckedOut;
    const isBrokenOrMissing = asset.status === "broken" || asset.status === "missing" || asset.status === "iffy";
    const expectedQty = asset.quantity ?? 1;
    const actualQty = gearQuantities[asset.id] ?? expectedQty;

    // Parent row: large, tappable, colored left stripe
    if (!isChild) {
      return (
        <div key={asset.id} className="space-y-1.5">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg p-3 transition-colors",
              isBrokenOrMissing ? "opacity-60 cursor-not-allowed bg-destructive/5" : "cursor-pointer hover:bg-primary/5",
              isUnchecked && "ring-2 ring-destructive/60 bg-destructive/5",
            )}
            style={{ borderLeft: `4px solid ${asset.color_code || 'hsl(var(--primary))'}` }}
            onClick={() => { if (!isBrokenOrMissing && (gearMode === "checkout" || gearMode === "checkin")) { toggleId(asset.id); setShowUncheckedWarning(false); } }}
          >
            {(gearMode === "checkout" || gearMode === "checkin") && (
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={isBrokenOrMissing ? false : checkedIds.has(asset.id)}
                  onCheckedChange={() => { if (!isBrokenOrMissing) { toggleId(asset.id); setShowUncheckedWarning(false); } }}
                  disabled={isBrokenOrMissing}
                  className="h-5 w-5"
                />
              </div>
            )}
            <span className="text-sm font-bold text-foreground flex-1">{asset.asset_name}</span>
            <Badge variant="outline" className="text-[10px] border-primary/20">{asset.category}</Badge>
            {isBrokenOrMissing && (
              <Badge
                className={cn("text-[9px] font-bold animate-pulse cursor-pointer hover:opacity-80",
                asset.status === "broken" ? "bg-destructive/20 text-destructive border-destructive/30" 
                : asset.status === "iffy" ? "bg-warning/20 text-warning border-warning/30"
                : "bg-warning/20 text-warning border-warning/30"
                )}
                onClick={(e) => { e.stopPropagation(); setHealAsset(asset); }}
              >
                {asset.status === "broken" ? "🔧 BROKEN" : asset.status === "iffy" ? "⚠️ IFFY" : "📦 MISSING"}
              </Badge>
            )}
            {!isBrokenOrMissing && (gearMode === "checkout" || gearMode === "checkin") && (
              <Select value={condition} onValueChange={(v) => setCondition(asset.id, v as GearCondition)}>
                <SelectTrigger className={cn("w-20 h-7 text-[10px]", condition === "iffy" && "border-warning/50", condition === "broken" && "border-destructive/50")} onClick={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="okay">Okay</SelectItem>
                  <SelectItem value="iffy">Iffy</SelectItem>
                  <SelectItem value="broken">Broken</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isAlreadyOut && (
              <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px]">Already Out</Badge>
            )}
            {isUnchecked && !isBrokenOrMissing && (
              <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] animate-pulse">MISSED</Badge>
            )}
          </div>
          {(condition === "iffy" || condition === "broken") && (gearMode === "checkout" || gearMode === "checkin") && (
            <Textarea
              placeholder="Describe the damage (required)…"
              value={gearNotes[asset.id] ?? ""}
              onChange={(e) => setGearNotes((prev) => ({ ...prev, [asset.id]: e.target.value }))}
              className={cn("min-h-[50px] text-xs ml-4", condition === "iffy" ? "border-warning/30 focus-visible:ring-warning" : "border-destructive/30 focus-visible:ring-destructive")}
            />
          )}
        </div>
      );
    }

    // Child row: indented, tappable, with count input for ALL children
    return (
      <div key={asset.id} className={cn(
        "space-y-1.5 ml-8 border-l-2 border-primary/20 pl-3",
        isBrokenOrMissing && "opacity-60",
        isUnchecked && !isBrokenOrMissing && "ring-2 ring-destructive/60 rounded-md p-1 bg-destructive/5",
      )}>
        <div
          className={cn(
            "flex items-center gap-2 flex-wrap rounded-md p-1.5 transition-colors",
            isBrokenOrMissing ? "cursor-not-allowed bg-destructive/5" : "cursor-pointer hover:bg-primary/5",
            !isBrokenOrMissing && conditionClass(condition),
          )}
          onClick={() => { if (!isBrokenOrMissing && (gearMode === "checkout" || gearMode === "checkin")) { toggleId(asset.id); setShowUncheckedWarning(false); } }}
        >
          {(gearMode === "checkout" || gearMode === "checkin") && (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isBrokenOrMissing ? false : checkedIds.has(asset.id)}
                onCheckedChange={() => { if (!isBrokenOrMissing) { toggleId(asset.id); setShowUncheckedWarning(false); } }}
                disabled={isBrokenOrMissing}
              />
            </div>
          )}
          <span className="rounded-full shrink-0 w-2 h-2" style={{ backgroundColor: asset.color_code }} />
          <span className="text-xs font-medium text-foreground">{asset.asset_name}</span>
          {asset.serial && <span className="text-[10px] text-muted-foreground">#{asset.serial}</span>}
          {isBrokenOrMissing && (
            <Badge
              className={cn("text-[9px] font-bold ml-auto animate-pulse cursor-pointer hover:opacity-80",
              asset.status === "broken" ? "bg-destructive/20 text-destructive border-destructive/30"
              : asset.status === "iffy" ? "bg-warning/20 text-warning border-warning/30"
              : "bg-warning/20 text-warning border-warning/30"
              )}
              onClick={(e) => { e.stopPropagation(); setHealAsset(asset); }}
            >
              {asset.status === "broken" ? "🔧 BROKEN" : asset.status === "iffy" ? "⚠️ IFFY" : "📦 MISSING"}
            </Badge>
          )}
          {!isBrokenOrMissing && (gearMode === "checkout" || gearMode === "checkin") && (
            <div className="flex items-center gap-1.5 ml-auto" onClick={(e) => e.stopPropagation()}>
              <span className="text-[10px] text-muted-foreground">Expected: {expectedQty}</span>
              <Input
                type="number"
                min={0}
                max={expectedQty}
                value={actualQty}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(expectedQty, parseInt(e.target.value) || 0));
                  setGearQuantities((prev) => ({ ...prev, [asset.id]: val }));
                }}
                className="w-16 h-7 text-xs text-center"
              />
              {actualQty < expectedQty && (
                <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] animate-pulse">
                  -{expectedQty - actualQty}
                </Badge>
              )}
            </div>
          )}
          {gearMode === "view" && !isBrokenOrMissing && (
            <span className="text-[10px] text-muted-foreground ml-auto">Qty: {expectedQty}</span>
          )}
          {isAlreadyOut && (
            <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px]">Already Out</Badge>
          )}
          {isUnchecked && !isBrokenOrMissing && (
            <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] animate-pulse">MISSED</Badge>
          )}
          {!isBrokenOrMissing && (gearMode === "checkout" || gearMode === "checkin") && (
            <Select value={condition} onValueChange={(v) => setCondition(asset.id, v as GearCondition)}>
              <SelectTrigger className={cn("w-20 h-7 text-[10px]", condition === "iffy" && "border-warning/50", condition === "broken" && "border-destructive/50")} onClick={(e) => e.stopPropagation()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="okay">Okay</SelectItem>
                <SelectItem value="iffy">Iffy</SelectItem>
                <SelectItem value="broken">Broken</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        {(condition === "iffy" || condition === "broken") && (gearMode === "checkout" || gearMode === "checkin") && (
          <Textarea
            placeholder="Describe the damage (required)…"
            value={gearNotes[asset.id] ?? ""}
            onChange={(e) => setGearNotes((prev) => ({ ...prev, [asset.id]: e.target.value }))}
            className={cn("min-h-[50px] text-xs", condition === "iffy" ? "border-warning/30 focus-visible:ring-warning" : "border-destructive/30 focus-visible:ring-destructive")}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className={cn(
          "max-h-[90vh] overflow-y-auto glass-dark border-primary/10 min-h-[320px]",
          gearMode !== "view" ? "max-w-lg sm:max-w-2xl" : "max-w-md",
          (isOT || isOTWarning) && "border-destructive/50"
        )}>
          <div
            className="space-y-0"
          >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Building2 className="h-5 w-5 text-primary" />
              {job.client_name}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {job.job_number && `Job #${job.job_number} · `}
              {job.job_date && format(parseISO(job.job_date + "T12:00:00"), "EEE, MMM d")}
              {job.call_time && ` · Call: ${job.call_time}`}
            </DialogDescription>
          </DialogHeader>

          {/* Missing Gear Warning Banner */}
          <AnimatePresence>
            {!missingBannerDismissed && (assignment.missing_asset_notes?.length ?? 0) > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -20, height: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-xl border-2 border-destructive/50 bg-destructive/10 p-4 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-destructive">⚠️ Heads up — Some gear is missing from this kit!</p>
                    <p className="text-xs text-muted-foreground mt-1">The following items were not present when this job was packed:</p>
                    <ul className="mt-2 space-y-1">
                      {(assignment.missing_asset_notes as MissingAssetNote[]).map((note, i) => (
                        <li key={i} className="text-xs text-foreground">
                          • <span className="font-semibold">{note.asset_name}</span>
                          <span className="text-muted-foreground"> (from {note.parent_name})</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2">Please make note and proceed accordingly.</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => setMissingBannerDismissed(true)}
                >
                  Got it
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live Timer */}
          {isClockedIn && (
            <div className={cn("rounded-xl p-4 space-y-3", isOT ? "bg-destructive/10 border border-destructive/30 glow-destructive" : isOTWarning ? "bg-warning/10 border border-warning/30 glow-warning" : "bg-primary/5 border border-primary/20 glow-primary")}>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Time Elapsed</p>
                  {assignment.time_manually_edited && (
                    <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[9px]">Edited</Badge>
                  )}
                </div>
                <p className={cn("text-4xl font-bold font-technical tracking-wider", isOT ? "text-destructive" : "text-primary")}>
                  {formatTimer(elapsed)}
                </p>
              </div>
              {guaranteedSecs > 0 && (
                <div className="text-center border-t border-border/30 pt-3">
                  {isOT ? (
                    <>
                      <p className="text-xs uppercase tracking-widest text-destructive font-semibold mb-1">⚡ Overtime</p>
                      <p className="text-2xl font-bold font-technical text-destructive">{formatTimer(otSeconds)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{otIncrements} × 15-min increment{otIncrements !== 1 ? "s" : ""}</p>
                    </>
                  ) : (
                    <>
                      <p className={cn("text-xs uppercase tracking-widest font-semibold mb-1", isOTWarning ? "text-warning" : "text-muted-foreground")}>
                        {isOTWarning ? "⚠ 30 min until Overtime!" : "Time Remaining"}
                      </p>
                      <p className={cn("text-2xl font-bold font-technical", isOTWarning ? "text-warning" : "text-foreground")}>{formatTimer(remaining)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{job.guaranteed_hours}h guaranteed</p>
                    </>
                  )}
                </div>
              )}
              {/* Edit Times Button */}
              <div className="text-center pt-1">
                <Button size="sm" variant="ghost" className="text-xs gap-1 text-cyan-400 hover:text-cyan-300" onClick={() => setShowEditTimes(true)}>
                  <Pencil className="h-3 w-3" /> Edit Times
                </Button>
              </div>
            </div>
          )}

          {/* Address */}
          {job.address && (
            <div className="rounded-md glass-card p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Navigation className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-foreground leading-snug">{job.address}</p>
              </div>
              <Button size="sm" variant="outline" className="w-full gap-2 sci-fi-btn text-primary" onClick={() => window.open(getGoogleMapsDirectionsUrl(job.address!), "_blank")}>
                <ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps
              </Button>
            </div>
          )}

          {job.notes && (
            <div className="rounded-md glass-card p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-foreground/80">{job.notes}</p>
            </div>
          )}

          {/* Gear Checkout Status */}
          {hasCheckedOutGear && gearMode === "view" && !isCompleted && (
            <div className="rounded-md bg-success/10 border border-success/30 p-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm text-success font-medium">Gear checked out</span>
            </div>
          )}

          {/* LAUNCHED Mission Dashboard: missing/broken gear alerts */}
          {isClockedIn && gearMode === "view" && (() => {
            const jobLostItems = lostItems.filter((li) => li.job_id === job.id);
            if (jobLostItems.length === 0) return null;
            return (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-semibold text-destructive">Gear Issues Logged</span>
                </div>
                {jobLostItems.map((li) => (
                  <div key={li.id} className="flex items-center gap-2 text-xs">
                    <Badge className={cn(
                      "text-[9px]",
                      li.condition === "broken" ? "bg-destructive/20 text-destructive border-destructive/30" :
                      li.condition === "iffy" ? "bg-warning/20 text-warning border-warning/30" :
                      "bg-muted text-muted-foreground"
                    )}>{li.condition}</Badge>
                    <span className="text-foreground">{li.item_name} ×{li.missing_quantity}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Live Chat Thread — available once mission is accepted */}
          {assignment.mission_accepted && employee && gearMode === "view" && (
            <LiveChatThread
              jobId={job.id}
              senderId={employee.id}
              senderName={employee.name || "Operator"}
              senderType="operator"
            />
          )}

          {/* ─── Active Mission Dashboard (Clocked In) ─── */}
          {isClockedIn && gearMode === "view" && (
            <div className="space-y-3">

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5 border-warning/30 text-warning hover:bg-warning/10"
                  disabled={createNotification.isPending || trafficSending}
                  onClick={() => setShowTrafficConsent(true)}
                >
                  <Car className="h-4 w-4" /> Traffic / Delayed
                </Button>
                <Button
                  className="gap-2 h-12 rounded-2xl bg-destructive/15 text-destructive hover:bg-destructive/25 border-0 font-semibold"
                  onClick={() => setShowReportBrokenGear(true)}
                >
                  <Wrench className="h-5 w-5" /> Report Lost or Broken Gear
                </Button>
              </div>

              {/* Traffic Consent Dialog */}
              <AlertDialog open={showTrafficConsent} onOpenChange={setShowTrafficConsent}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Share Your Location?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Share your current location with Mission Control so they can see your delay? This is a one-time ping — we never track you in the background.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={trafficSending}
                      onClick={async (e) => {
                        e.preventDefault();
                        if (!employee) return;
                        setTrafficSending(true);
                        let lat: number | undefined;
                        let lng: number | undefined;
                        try {
                          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: false })
                          );
                          lat = pos.coords.latitude;
                          lng = pos.coords.longitude;
                        } catch {
                          // Location denied or unavailable — still send alert without coords
                        }
                        await createNotification.mutateAsync({
                          operator_id: employee.id,
                          job_id: job.id,
                          notification_type: "traffic_delay",
                          message: `[${format(new Date(), "h:mm a")}] ${employee.name} reported traffic/delay.`,
                          metadata: lat != null ? { lat, lng } : {},
                        } as any);
                        toast.success("Traffic alert sent to Mission Control!");
                        setTrafficSending(false);
                        setShowTrafficConsent(false);
                      }}
                    >
                      {trafficSending ? "Locating…" : "Share Location"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Gear Section */}
          {allAssetIds.size > 0 && (gearMode === "checkout" || gearMode === "checkin") && (
            <div className="space-y-3 relative">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {gearMode === "checkin" ? "Check-In Gear" : "Gear Checkout"}
                </p>
                <Button size="sm" variant="ghost" onClick={handleSelectAll} className="text-xs h-7 text-primary">
                  {allChecked ? <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> : null}
                  Select All (I'm in a hurry)
                </Button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto space-y-2 relative">
                {hierarchy.roots.map((parent) => {
                  const children = hierarchy.childMap.get(parent.id) ?? [];
                  return (
                    <div key={parent.id} className="rounded-md glass-card p-3 space-y-2">
                      {renderGearItem(parent)}
                      {children.length > 0 && (
                        <div className="space-y-1.5">
                          {children.map((child) => renderGearItem(child, true, parent.id))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Scroll fade gradient */}
                <div className="pointer-events-none sticky bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent" />
              </div>
              {/* Sticky counter bar */}
              <div className={cn(
                "sticky bottom-0 z-10 rounded-lg p-2 text-center text-sm font-semibold border",
                allChecked
                  ? "bg-success/10 border-success/30 text-success"
                  : "bg-warning/10 border-warning/30 text-warning"
              )}>
                {checkedIds.size} of {checkableAssetIds.size} items checked
              </div>
            </div>
          )}

          {/* Gear loadout view (read-only when not in checkout/checkin mode) */}
          {allAssetIds.size > 0 && gearMode === "view" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gear Loadout</p>
              <GearLoadoutAccordion roots={hierarchy.roots} childMap={hierarchy.childMap} />
            </div>
          )}


          {/* Clocked-in info */}
          {isClockedIn && assignment.actual_start_time && (
            <div className="rounded-md bg-success/10 border border-success/30 p-3 flex items-center gap-2">
              <Play className="h-4 w-4 text-success" />
              <span className="text-sm text-success font-medium font-technical">
                Clocked in at {format(new Date(assignment.actual_start_time), "h:mm a")}
              </span>
              {assignment.time_manually_edited && (
                <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[9px] ml-auto">Edited</Badge>
              )}
            </div>
          )}

          {/* Final Report (completed) */}
          {isCompleted && (
            <div className="rounded-xl glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Job Report</p>
                <Button size="sm" variant="ghost" className="text-xs gap-1 text-primary hover:text-primary/80" onClick={() => setShowEditTimes(true)}>
                  <Pencil className="h-3 w-3" /> Edit Timesheet
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Clock In</p>
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-technical text-foreground">{format(new Date(assignment.actual_start_time!), "h:mm a")}</p>
                    {assignment.time_manually_edited && <Badge className="bg-primary/20 text-primary border-primary/30 text-[8px]">Edited</Badge>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Clock Out</p>
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-technical text-foreground">{format(new Date(assignment.actual_end_time!), "h:mm a")}</p>
                    {assignment.time_manually_edited && <Badge className="bg-primary/20 text-primary border-primary/30 text-[8px]">Edited</Badge>}
                  </div>
                </div>
                {totalTime !== null && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Total Time</p>
                    <p className="text-sm font-technical text-foreground">{formatTimer(totalTime)}</p>
                  </div>
                )}
                {totalTime !== null && guaranteedSecs > 0 && totalTime > guaranteedSecs && (
                  <div>
                    <p className="text-[10px] text-destructive uppercase">OT Accrued</p>
                    <p className="text-sm font-technical text-destructive">{formatTimer(totalTime - guaranteedSecs)} ({Math.ceil((totalTime - guaranteedSecs) / 900)} × 15min)</p>
                  </div>
                )}
              </div>
              {/* Expenses */}
              {(assignment.expense_amount ?? 0) > 0 && (
                <div className="border-t border-border/30 pt-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Parking / Travel</p>
                  <p className="text-sm font-technical text-foreground">${(assignment.expense_amount ?? 0).toFixed(2)}</p>
                </div>
              )}
              {/* Mileage */}
              {(assignment.mileage_amount ?? 0) > 0 && (
                <div className="border-t border-border/30 pt-2">
                  <p className="text-[10px] text-muted-foreground uppercase">🚗 Mileage Reimbursement</p>
                  <p className="text-sm font-technical text-foreground">${(assignment.mileage_amount ?? 0).toFixed(2)}</p>
                </div>
              )}
              {assignment.lunch_check_response && (
                <div className="border-t border-border/30 pt-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Lunch Check</p>
                  <p className="text-sm text-foreground">
                    {assignment.lunch_check_response === "yes" ? "✅ Had lunch" : "❌ No lunch"}
                    {assignment.lunch_check_time && ` at ${format(new Date(assignment.lunch_check_time), "h:mm a")}`}
                  </p>
                </div>
              )}
              {assignment.end_of_day_notes && (
                <div className="border-t border-border/30 pt-2">
                  <p className="text-[10px] text-muted-foreground uppercase">End of Day Notes</p>
                  <p className="text-sm text-foreground/80">{assignment.end_of_day_notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {/* Gear Checkout — unlocks Clock In */}
            {!hasCheckedOutGear && !assignment.actual_start_time && gearMode === "view" && (
              <button className="w-full py-4 text-lg sci-fi-btn text-primary flex items-center justify-center gap-2" onClick={handleStartGearCheckout}>
                <Package className="h-5 w-5" /> Begin Gear Checkout
              </button>
            )}
            {gearMode === "checkout" && (
              <button
                className={cn(
                  "w-full py-4 text-lg sci-fi-btn flex items-center justify-center gap-2",
                  checkedIds.size > 0 ? "text-primary" : "text-muted-foreground opacity-50 cursor-not-allowed"
                )}
                onClick={handleGearCheckoutConfirm}
                disabled={checkedIds.size === 0 || updateAssignment.isPending}
              >
                <CheckCircle2 className="h-5 w-5" />
                {updateAssignment.isPending ? "Processing…" : allChecked ? "Confirm Gear Checkout" : `Confirm Checkout (${checkedIds.size}/${checkableAssetIds.size} checked)`}
              </button>
            )}

            {/* Manual Clock In — only after gear is checked out */}
            {hasCheckedOutGear && !assignment.actual_start_time && gearMode === "view" && (
              <button
                className="w-full py-4 text-lg sci-fi-btn text-primary flex items-center justify-center gap-2 disabled:opacity-40"
                onClick={handleStartClock}
                disabled={updateAssignment.isPending || updateJobStatus.isPending}
              >
                <Play className="h-5 w-5" />
                {updateAssignment.isPending || updateJobStatus.isPending ? "Processing…" : "Clock In"}
              </button>
            )}

            {/* Clock Out & Gear Return (when launched) */}
            {isClockedIn && (
              <>
                {gearMode === "view" && (
                  <button
                    className="w-full py-3 text-sm sci-fi-btn text-primary flex items-center justify-center gap-2"
                    onClick={() => {
                      setGearMode("checkin");
                      // Auto-select all for virtual gear
                      if (isAllVirtualGear) {
                        setCheckedIds(new Set(checkableAssetIds));
                        const newConditions: Record<string, GearCondition> = {};
                        assignedAssets.forEach(a => { newConditions[a.id] = "okay"; });
                        setGearConditions(newConditions);
                      } else {
                        setCheckedIds(new Set());
                      }
                    }}
                  >
                    <Package className="h-4 w-4" /> Return Gear
                  </button>
                )}
                {gearMode === "checkin" && (
                  <button
                    className={cn(
                      "w-full py-3 text-sm sci-fi-btn flex items-center justify-center gap-2",
                      allChecked ? "text-primary" : "text-muted-foreground opacity-50 cursor-not-allowed"
                    )}
                    onClick={handleGearCheckinConfirm}
                    disabled={!allChecked || updateAssetStatus.isPending || updateAsset.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {allChecked ? "Confirm Gear Return" : `Check all items (${checkedIds.size}/${checkableAssetIds.size})`}
                  </button>
                )}
                <button
                  className="w-full py-4 text-lg sci-fi-btn-destructive text-destructive flex items-center justify-center gap-2 disabled:opacity-40"
                  onClick={handleClockOutRequest}
                  disabled={updateAssignment.isPending}
                >
                  <Square className="h-5 w-5" />
                  {updateAssignment.isPending ? "Processing…" : "Clock Out"}
                </button>
              </>
            )}

            {/* Undo Clock-Out: when operator has actual_end_time but job not permanently completed */}
            {isCompleted && job.status !== "completed" && (
              <button
                className="w-full py-3 text-sm sci-fi-btn text-warning flex items-center justify-center gap-2 disabled:opacity-40"
                onClick={async () => {
                  await updateAssignment.mutateAsync({ id: assignment.id, actual_end_time: null });
                  await setOperationalJobStatus("launched");
                  toast.success("Clock-out undone — you're back on the clock!");
                  // Don't close - stay in dialog so clock restarts
                }}
                disabled={updateAssignment.isPending || updateJobStatus.isPending}
              >
                <ArrowLeft className="h-4 w-4" />
                {updateAssignment.isPending || updateJobStatus.isPending ? "Processing…" : "Undo / Clock Back In"}
              </button>
            )}
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Timesheet Modal */}
      <EditTimesDialog
        open={showEditTimes}
        onOpenChange={setShowEditTimes}
        assignment={assignment}
        operatorName={employee?.name || "Operator"}
        jobNumber={job.job_number || job.client_name || ""}
        jobAddress={job.address}
      />

      {/* Clock-Out Report Modal */}
      <AlertDialog open={showClockOutReport} onOpenChange={setShowClockOutReport}>
        <AlertDialogContent className="glass-dark border-primary/20 max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <Square className="h-5 w-5 text-primary" /> End of Day Report
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80">
              Leave a note about this job before clocking out (required).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Client vibes, location issues, parking, anything notable…"
            value={endOfDayNotes}
            onChange={(e) => setEndOfDayNotes(e.target.value)}
            className="min-h-[100px]"
          />

          {/* 💳 Expenses Section */}
          <div className="space-y-3 rounded-lg border border-border/30 p-3">
            <p className="text-sm font-semibold text-foreground">💳 Expenses (optional)</p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Total amount ($)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(parseFloat(e.target.value) || 0)}
                className="w-full"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              {receiptUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
                  <img src={url} alt={`Receipt ${i + 1}`} className="h-12 w-12 rounded object-cover" />
                  <span className="text-xs text-muted-foreground flex-1">Receipt {i + 1}</span>
                  <button onClick={() => setReceiptUrls(prev => prev.filter((_, j) => j !== i))} className="text-destructive text-xs">Remove</button>
                </div>
              ))}
              {receiptUrls.length < 3 && (
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-primary/30 p-3 hover:bg-primary/5 transition-colors">
                  <span className="text-sm text-primary">📷 Add Receipt Photo</span>
                  {receiptUploading && <span className="text-xs text-muted-foreground animate-spin">⏳</span>}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={receiptUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setReceiptUploading(true);
                      try {
                        const path = `${assignment.id}/${Date.now()}.jpg`;
                        const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, file);
                        if (uploadErr) throw uploadErr;
                        const { data: signedData } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
                        if (signedData?.signedUrl) setReceiptUrls(prev => [...prev, signedData.signedUrl]);
                        toast.success("Receipt uploaded!");
                      } catch (err: any) {
                        toast.error(`Upload failed: ${err.message}`);
                      } finally {
                        setReceiptUploading(false);
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="sci-fi-btn text-primary"
              onClick={handleClockOutConfirm}
              disabled={!endOfDayNotes.trim() || updateAssignment.isPending}
            >
              {updateAssignment.isPending ? "Processing…" : "Submit & Clock Out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gear Still Out Warning */}
      <AlertDialog open={showGearStillOut} onOpenChange={setShowGearStillOut}>
        <AlertDialogContent className="glass-dark border-warning/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <Package className="h-5 w-5" /> OI! 👋
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80 text-sm leading-relaxed">
              I see you gots some gear with ya... ready to check it back in for the next op?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogAction
              className="bg-muted text-foreground hover:bg-muted/80"
              onClick={() => {
                setShowGearStillOut(false);
                setShowClockOutReport(true);
              }}
            >
              Not Yet — I'll Check In Later
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-primary text-primary-foreground"
              onClick={() => {
                setShowGearStillOut(false);
                setGearMode("checkin");
                setCheckedIds(new Set());
              }}
            >
              <Package className="h-4 w-4 mr-1" /> Yes — Return Gear Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={showLiability} onOpenChange={setShowLiability}>
        <AlertDialogContent className="glass-dark border-warning/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" /> Asset Liability Warning
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80">
              <strong>Warning:</strong> You are responsible for these assets. If anything is missing on the return trip, it's on you!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="sci-fi-btn text-primary"
              onClick={handleLiabilityAcceptAndSelectAll}
            >
              I Understand — Select All & Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* "Are You Suuuuure?" Missing Gear Interceptor */}
      <AlertDialog open={showMissingGearWarning} onOpenChange={setShowMissingGearWarning}>
        <AlertDialogContent className="glass-dark border-warning/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning text-lg">
              <AlertTriangle className="h-6 w-6" /> Are you suuuuure?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-foreground/90 text-base leading-relaxed space-y-2">
                <p>The following items are flagged as missing or damaged:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {missingGearSummary.map((item, i) => (
                    <li key={i} className="text-warning font-medium text-sm">{item}</li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground pt-1">
                  Are you absolutely sure these items are missing or damaged? This will update the master inventory.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="sm:flex-1">No, let me check again</AlertDialogCancel>
            <AlertDialogAction
              className="sm:flex-1 bg-warning text-warning-foreground hover:bg-warning/90 font-bold"
              onClick={async () => {
                setShowMissingGearWarning(false);
                await executeGearCheckout();
              }}
            >
              Yes, I'm sure
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Whoooops! Missing Gear Confirmation */}
      <AlertDialog open={showWhoopsMissing} onOpenChange={setShowWhoopsMissing}>
        <AlertDialogContent className="glass-dark border-warning/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning text-lg">
              <AlertTriangle className="h-6 w-6" /> Whoooops!
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-foreground/90 text-base leading-relaxed space-y-3">
                <p>Are you sure something is missing? These items will be logged as missing:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {whoopsMissingItems.map(({ asset, parentAsset }) => (
                    <li key={asset.id} className="text-warning font-medium text-sm">
                      {asset.asset_name}
                      {parentAsset && <span className="text-muted-foreground font-normal"> (from {parentAsset.asset_name})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="sm:flex-1">Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="sm:flex-1 bg-warning text-warning-foreground hover:bg-warning/90 font-bold"
              onClick={handleWhoopsMissingConfirm}
            >
              Yes, it's missing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={showOverachiever} onOpenChange={setShowOverachiever}>
        <AlertDialogContent className="glass-dark border-primary/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-primary">
              <Zap className="h-5 w-5" /> Whoa there, overachiever!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80 text-base leading-relaxed">
              Looks like you're suuuuper early! If the client told you to be here early then proceed, if not, we can't charge until the call time.
              <span className="block mt-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground/90">Call time:</span> {job.call_time ? (() => { const [h,m] = job.call_time!.split(":").map(Number); const d = new Date(); d.setHours(h, m||0); return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); })() : "N/A"} on {job.job_date ? new Date(job.job_date + "T12:00:00").toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'}) : "N/A"}
              </span>
              <span className="block text-sm text-muted-foreground">
                <span className="font-semibold text-foreground/90">Right now:</span> {new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})} on {new Date().toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'})}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="sci-fi-btn border-muted" onClick={() => setShowOverachiever(false)}>Wait</Button>
            <Button
              className="sci-fi-btn text-primary"
              onClick={() => {
                setShowOverachiever(false);
                doClockIn();
              }}
            >
              Proceed
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Geofence Block */}
      <AlertDialog open={!!geofenceBlocker} onOpenChange={(o) => !o && setGeofenceBlocker(null)}>
        <AlertDialogContent className="glass-dark border-warning/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <MapPin className="h-5 w-5" /> Too far from the venue
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80">
              You appear to be too far from the venue to clock in. Please wait until you are on-site.
              {geofenceBlocker && (
                <span className="block mt-2 text-xs text-muted-foreground">
                  You're about {geofenceBlocker.distance.toFixed(2)} mi away (limit: 0.5 mi).
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setGeofenceBlocker(null)}>Wait</Button>
            <Button
              variant="ghost"
              className="text-xs text-muted-foreground hover:text-warning"
              onClick={() => {
                const dist = geofenceBlocker?.distance ?? null;
                setGeofenceBlocker(null);
                doClockIn({ geofenceFlagged: true, distanceMiles: dist ?? undefined });
                toast.warning("Clocked in outside geofence — flagged for Mission Control review.");
              }}
            >
              Force Clock In (Flagged)
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tardy Modal */}
      <AlertDialog open={showTardy} onOpenChange={setShowTardy}>
        <AlertDialogContent className="glass-dark border-warning/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <Clock className="h-5 w-5" /> Running Late?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80">
              It looks like you're past the call time. Let's let the bosses know!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="sci-fi-btn text-primary" onClick={handleTardyAcknowledge} disabled={createNotification.isPending}>
              {createNotification.isPending ? "Sending…" : "Acknowledge & Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hunger Check */}
      <AlertDialog open={showHunger} onOpenChange={setShowHunger}>
        <AlertDialogContent className="glass-dark border-primary/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-primary">
              <Utensils className="h-5 w-5" /> Have you eaten anything?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80 text-base">
              You look hungry! It's been 6 hours — time for a check-in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction className="sci-fi-btn text-primary w-full" onClick={() => handleHungerResponse("yes")}>
              ✅ Yes, I've had lunch
            </AlertDialogAction>
            <AlertDialogAction className="sci-fi-btn-destructive text-destructive w-full" onClick={() => handleHungerResponse("no")}>
              ❌ No, not yet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Needs Looking At Warning */}
      <AlertDialog open={showNeedsPrepWarning} onOpenChange={setShowNeedsPrepWarning}>
        <AlertDialogContent className="glass-dark border-warning/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <ShieldAlert className="h-5 w-5" /> Gear Not Looked At
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80 text-base leading-relaxed">
              This gear hasn't been checked out by a back office expert (or they forgot to move it). Want to override that?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>No, wait</AlertDialogCancel>
            <AlertDialogAction
              className="bg-warning text-warning-foreground hover:bg-warning/90 font-bold"
              onClick={() => {
                setShowNeedsPrepWarning(false);
                proceedToCheckout();
              }}
            >
              Yes, override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report Lost or Broken Gear — Apple-style picker */}
      <Dialog open={showReportBrokenGear} onOpenChange={(v) => { setShowReportBrokenGear(v); if (!v) { setBrokenGearId(""); setBrokenGearNotes(""); setBrokenGearQty(1); } }}>
        <DialogContent className="glass-dark border-0 max-w-md max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground text-xl font-semibold">
              <Wrench className="h-5 w-5 text-destructive" /> Report Lost or Broken Gear
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Tap the item that's lost or broken, then describe what happened.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block uppercase tracking-wide">Select Item</Label>
              <div className="space-y-1 max-h-[240px] overflow-y-auto rounded-2xl bg-white/5 p-2 border-0">
                {(() => {
                  const realAssets = assignedAssets.filter(a => !isVirtualAssetId(a.id));
                  const parents = realAssets.filter(a => !a.parent_asset_id);
                  const childMap = new Map<string, Asset[]>();
                  realAssets.filter(a => a.parent_asset_id).forEach(a => {
                    const siblings = childMap.get(a.parent_asset_id!) ?? [];
                    siblings.push(a);
                    childMap.set(a.parent_asset_id!, siblings);
                  });
                  const orphans = realAssets.filter(a => a.parent_asset_id && !realAssets.some(p => p.id === a.parent_asset_id));

                  if (realAssets.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground text-center py-4 italic">
                        No gear assigned to this job yet. Check out gear first, then report issues here.
                      </p>
                    );
                  }

                  const itemRowClass = (active: boolean, base: string) => cn(
                    base,
                    "transition-colors border-0",
                    active ? "bg-primary/20 text-foreground" : "hover:bg-white/5 text-foreground"
                  );

                  return (
                    <>
                      {parents.map(parent => (
                        <div key={parent.id} className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => { setBrokenGearId(parent.id); setBrokenGearQty(1); }}
                            className={itemRowClass(brokenGearId === parent.id, "w-full text-left px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2")}
                          >
                            <Package className="h-4 w-4 shrink-0 text-primary" />
                            {parent.asset_name}
                            {parent.color_code && (
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: parent.color_code }} />
                            )}
                          </button>
                          {(childMap.get(parent.id) || []).map(child => (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => { setBrokenGearId(child.id); setBrokenGearQty(1); }}
                              className={itemRowClass(brokenGearId === child.id, "w-full text-left pl-8 pr-3 py-1.5 rounded-xl text-xs flex items-center gap-2")}
                            >
                              <span className="text-muted-foreground">└</span>
                              {child.asset_name}
                              {child.quantity > 1 && <Badge variant="outline" className="text-[9px] h-4 px-1 border-0 bg-white/10">×{child.quantity}</Badge>}
                            </button>
                          ))}
                        </div>
                      ))}
                      {orphans.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => { setBrokenGearId(a.id); setBrokenGearQty(1); }}
                          className={itemRowClass(brokenGearId === a.id, "w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2")}
                        >
                          {a.asset_name}
                          {a.quantity > 1 && <Badge variant="outline" className="text-[9px] h-4 px-1 border-0 bg-white/10">×{a.quantity}</Badge>}
                        </button>
                      ))}
                    </>
                  );
                })()}
              </div>
            </div>

            {(() => {
              const sel = assignedAssets.find(a => a.id === brokenGearId);
              const maxQ = Math.max(1, sel?.quantity ?? 1);
              if (!sel || maxQ <= 1) return null;
              return (
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block uppercase tracking-wide">Quantity Lost/Broken?</Label>
                  <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-2">
                    <Button type="button" size="icon" className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-foreground border-0 text-2xl" onClick={() => setBrokenGearQty(q => Math.max(1, q - 1))} disabled={brokenGearQty <= 1}>−</Button>
                    <div className="flex-1 text-center">
                      <div className="text-3xl font-semibold tabular-nums text-foreground">{brokenGearQty}</div>
                      <div className="text-xs text-muted-foreground">of {maxQ} assigned</div>
                    </div>
                    <Button type="button" size="icon" className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-foreground border-0 text-2xl" onClick={() => setBrokenGearQty(q => Math.min(maxQ, q + 1))} disabled={brokenGearQty >= maxQ}>+</Button>
                  </div>
                </div>
              );
            })()}

            <div>
              <Label className="text-xs text-muted-foreground mb-2 block uppercase tracking-wide">What happened?</Label>
              <Textarea
                placeholder="Describe what happened…"
                value={brokenGearNotes}
                onChange={(e) => setBrokenGearNotes(e.target.value)}
                className="min-h-[80px] rounded-2xl bg-white/5 border-0 focus-visible:ring-1 focus-visible:ring-primary/40 text-base resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full h-14 rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90 border-0 text-base font-semibold shadow-lg"
              disabled={!brokenGearId || !brokenGearNotes.trim() || createLostItem.isPending}
              onClick={async () => {
                const asset = assignedAssets.find(a => a.id === brokenGearId);
                if (!asset) return;
                const parent = assignedAssets.find(a => a.id === asset.parent_asset_id);
                const totalQty = Math.max(1, asset.quantity ?? 1);
                const reportedQty = Math.min(Math.max(1, brokenGearQty), totalQty);
                const partial = reportedQty < totalQty;

                await createLostItem.mutateAsync({
                  item_name: asset.asset_name,
                  missing_quantity: reportedQty,
                  condition: "broken",
                  parent_rig_name: parent?.asset_name ?? asset.asset_name,
                  parent_asset_id: asset.parent_asset_id,
                  job_id: job.id,
                  operator_id: employee?.id,
                  notes: brokenGearNotes.trim(),
                });

                // Decrement quantity on partial loss; flag whole asset on full loss
                try {
                  if (partial) {
                    await updateAsset.mutateAsync({
                      id: asset.id,
                      quantity: totalQty - reportedQty,
                      damage_notes: `Partial loss (${reportedQty}/${totalQty}) — ${brokenGearNotes.trim()}`,
                    });
                  } else {
                    await updateAsset.mutateAsync({
                      id: asset.id,
                      status: "broken",
                      damage_notes: brokenGearNotes.trim(),
                    });
                  }
                } catch (e: any) {
                  console.warn("Asset quantity update failed:", e?.message);
                }

                if (employee) {
                  await createNotification.mutateAsync({
                    operator_id: employee.id,
                    job_id: job.id,
                    notification_type: "broken_gear",
                    message: `[${format(new Date(), "h:mm a")}] ${employee.name} reported ${reportedQty}× ${asset.asset_name} as lost/broken — ${brokenGearNotes.trim()}`,
                  });
                }
                toast.success(partial ? `Reported ${reportedQty} of ${totalQty} ${asset.asset_name}` : `Reported ${asset.asset_name}`);
                setBrokenGearId("");
                setBrokenGearNotes("");
                setBrokenGearQty(1);
                setShowReportBrokenGear(false);
              }}
            >
              {createLostItem.isPending ? "Reporting…" : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Heal Confirmation Dialog */}
      <AlertDialog open={!!healAsset} onOpenChange={(v) => { if (!v) setHealAsset(null); }}>
        <AlertDialogContent className="glass-dark border-primary/10 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <ShieldAlert className="h-5 w-5 text-warning" />
              Resolve Flagged Gear
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80 text-sm leading-relaxed">
              <strong>{healAsset?.asset_name}</strong> is currently marked as{" "}
              <span className="font-bold uppercase">{healAsset?.status}</span>.
              <br /><br />
              Are you sure this item is currently present and working?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="sm:flex-1" disabled={healLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="sm:flex-1 gap-1.5"
              onClick={(e) => { e.preventDefault(); handleHealConfirm(); }}
              disabled={healLoading}
            >
              <CheckCircle2 className="h-4 w-4" />
              {healLoading ? "Updating…" : "Yes, it's fine"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accept Mission Popup */}
      <AlertDialog open={showMissionAccept} onOpenChange={setShowMissionAccept}>
        <AlertDialogContent className="glass-dark border-primary/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-primary text-lg">
              <Zap className="h-6 w-6" /> Mission Briefing 🚀
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-foreground/90 space-y-4">
                <p className="text-base font-medium">You've been assigned a new mission!</p>
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{job.job_date ? format(parseISO(job.job_date + "T12:00:00"), "EEEE, MMMM d, yyyy") : "TBD"}</span>
                  </div>
                  {job.call_time && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-primary" />
                      <span>Call Time: <span className="font-medium">{job.call_time}</span></span>
                    </div>
                  )}
                  {/* Office Call Time — shown in big text when gear is involved */}
                  {(() => {
                    const hasGear = assignedAssets.filter(a => !isVirtualAssetId(a.id) && !a.parent_asset_id).length > 0;
                    if (!hasGear || !job.call_time) return null;
                    const offsets: Record<string, number> = { "Manhattan": 45, "Outer Boro": 75, "Tri-State / Road Trip": 90, "Other": 60 };
                    const offsetMin = offsets[job.location_type] ?? 60;
                    // Parse call_time (e.g. "08:30 AM" or "14:00")
                    try {
                      const today = job.job_date || format(new Date(), "yyyy-MM-dd");
                      // Try parsing common formats
                      let parsed: Date | null = null;
                      for (const fmt of ["hh:mm a", "HH:mm", "h:mm a", "H:mm"]) {
                        try { parsed = parse(job.call_time, fmt, parseISO(today + "T00:00:00")); if (!isNaN(parsed.getTime())) break; parsed = null; } catch { parsed = null; }
                      }
                      if (!parsed || isNaN(parsed.getTime())) return null;
                      const officeTime = new Date(parsed.getTime() - offsetMin * 60 * 1000);
                      return (
                        <div className="rounded-md bg-primary/10 border border-primary/30 p-2 text-center">
                          <p className="text-xs text-muted-foreground">Office Arrival Time</p>
                          <p className="text-2xl font-bold text-primary">{format(officeTime, "h:mm a")}</p>
                        </div>
                      );
                    } catch { return null; }
                  })()}
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span>{job.client_name}</span>
                  </div>
                  {job.address && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="text-xs">{job.address}</span>
                    </div>
                  )}
                  {/* Mileage reimbursement for jobs > 50 miles */}
                  {(job.distance_miles ?? 0) > 50 && (
                    <div className="rounded-md bg-accent/30 border border-accent/50 p-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-accent-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Mileage</p>
                        <p className="text-sm font-semibold">{Math.round(job.distance_miles!)} mi — ${(job.mileage_reimbursement ?? (job.distance_miles! * 0.70)).toFixed(2)} reimbursement</p>
                      </div>
                    </div>
                  )}
                  {assignedAssets.filter(a => !isVirtualAssetId(a.id) && !a.parent_asset_id).length > 0 && (
                    <div className="flex items-start gap-2 text-sm">
                      <Package className="h-4 w-4 text-primary mt-0.5" />
                      <div>
                        <span className="font-medium">Gear:</span>
                        <ul className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                          {assignedAssets.filter(a => !isVirtualAssetId(a.id) && !a.parent_asset_id).map(a => (
                            <li key={a.id}>• {a.asset_name}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground italic">Do you accept this mission?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="sm:flex-1" onClick={() => { setShowMissionAccept(false); onClose(); }}>
              Not Now
            </AlertDialogCancel>
            <AlertDialogAction
              className="sm:flex-1 gap-1.5"
              onClick={async () => {
                if (assignment.mission_accepted === true) {
                  setShowMissionAccept(false);
                  navigate(`/gear-checkout/${job.id}`);
                  return;
                }

                // Mark assignment as accepted
                await updateAssignment.mutateAsync({ id: assignment.id, mission_accepted: true });
                // Notify admin
                if (employee) {
                  await supabase.from("admin_notifications").insert({
                    notification_type: "mission_accepted",
                    operator_id: employee.id,
                    job_id: job.id,
                    title: "Mission Accepted! 🚀",
                    message: `${employee.name} accepted the mission for ${job.client_name} on ${job.job_date}`,
                    recipient_role: "manager",
                  } as any);
                }
                setShowMissionAccept(false);
                // Navigate to gear checkout
                navigate(`/gear-checkout/${job.id}`);
              }}
              disabled={updateAssignment.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              {updateAssignment.isPending ? "Accepting…" : "Accept Mission"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ─── Edit Timesheet Dialog ─── */
// 2026 IRS standard mileage rate
const IRS_MILEAGE_RATE = 0.70;
const MILEAGE_THRESHOLD_MILES = 50;

function EditTimesDialog({ open, onOpenChange, assignment, operatorName, jobNumber, jobAddress }: {
  open: boolean; onOpenChange: (o: boolean) => void; assignment: Assignment;
  operatorName: string; jobNumber: string; jobAddress?: string;
}) {
  const updateAssignment = useUpdateAssignment();
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [expense, setExpense] = useState(0);
  const [mileage, setMileage] = useState(0);
  const [distanceMiles, setDistanceMiles] = useState<number | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTimeIn(assignment.actual_start_time ? format(new Date(assignment.actual_start_time), "yyyy-MM-dd'T'HH:mm") : "");
      setTimeOut(assignment.actual_end_time ? format(new Date(assignment.actual_end_time), "yyyy-MM-dd'T'HH:mm") : "");
      setExpense(assignment.expense_amount ?? 0);
      setMileage(assignment.mileage_amount ?? 0);
      setDistanceMiles(null);
    }
  }, [open, assignment]);

  // Auto-calculate mileage when dialog opens with an address
  useEffect(() => {
    if (!open || !jobAddress || distanceMiles !== null) return;
    const calcDistance = async () => {
      setCalcLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("maps-proxy", {
          body: { action: "distance", origin: "New York, NY 10001", destination: jobAddress },
        });
        if (!error && data?.distanceMiles) {
          const oneWay = data.distanceMiles;
          setDistanceMiles(oneWay);
          if (oneWay > MILEAGE_THRESHOLD_MILES && mileage === 0) {
            const roundTrip = oneWay * 2;
            const amount = Math.round(roundTrip * IRS_MILEAGE_RATE * 100) / 100;
            setMileage(amount);
          }
        }
      } catch { /* distance calc failed, allow manual entry */ }
      setCalcLoading(false);
    };
    calcDistance();
  }, [open, jobAddress]);

  const calculatedElapsed = useMemo(() => {
    if (!timeIn) return null;
    const start = new Date(timeIn);
    const end = timeOut ? new Date(timeOut) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const secs = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    return formatTimer(secs);
  }, [timeIn, timeOut]);

  const handleSave = async () => {
    const updates: any = { id: assignment.id, time_manually_edited: true };
    if (timeIn) updates.actual_start_time = new Date(timeIn).toISOString();
    if (timeOut) updates.actual_end_time = new Date(timeOut).toISOString();
    if (expense > 0) updates.expense_amount = expense;
    if (mileage > 0) updates.mileage_amount = mileage;
    await updateAssignment.mutateAsync(updates);

    // Notify managers about the edit
    await supabase.from("admin_notifications").insert({
      operator_id: assignment.operator_id || assignment.id,
      job_id: assignment.job_id || assignment.id,
      notification_type: "time_edit",
      recipient_role: "manager",
      title: "Timesheet Edited",
      message: `${operatorName} edited their timesheet on job ${jobNumber}. Times: ${timeIn ? new Date(timeIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} – ${timeOut ? new Date(timeOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "active"}. Expenses: $${expense.toFixed(2)}. Mileage: $${mileage.toFixed(2)}.`,
    });

    toast.success("Timesheet updated (marked as edited)");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-dark border-primary/20 max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Pencil className="h-4 w-4 text-primary" /> Edit Timesheet
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Adjust times, expenses, and mileage. Changes are flagged as manually edited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Time In/Out */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Time In</Label>
              <Input type="datetime-local" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
            </div>
            {(assignment.actual_end_time || timeOut) && (
              <div>
                <Label className="text-xs text-muted-foreground">Time Out</Label>
                <Input type="datetime-local" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} />
              </div>
            )}
            {calculatedElapsed && (
              <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Calculated Elapsed</p>
                <p className="text-lg font-bold font-technical text-primary">{calculatedElapsed}</p>
              </div>
            )}
          </div>

          {/* Parking / Travel Expenses */}
          <div className="rounded-lg border border-border/30 p-3 space-y-2">
            <p className="text-sm font-semibold text-foreground">💳 Parking / Travel ($)</p>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={expense || ""}
              onChange={(e) => setExpense(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </div>

          {/* Mileage */}
          <div className="rounded-lg border border-border/30 p-3 space-y-2">
            <p className="text-sm font-semibold text-foreground">🚗 Mileage Reimbursement ($)</p>
            {calcLoading && (
              <p className="text-xs text-muted-foreground animate-pulse">Calculating distance…</p>
            )}
            {distanceMiles !== null && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>📍 One-way: {distanceMiles.toFixed(1)} mi | Round-trip: {(distanceMiles * 2).toFixed(1)} mi</p>
                {distanceMiles > MILEAGE_THRESHOLD_MILES ? (
                  <p className="text-primary font-medium">
                    Over {MILEAGE_THRESHOLD_MILES} mi — IRS rate ${IRS_MILEAGE_RATE}/mi × {(distanceMiles * 2).toFixed(1)} mi = ${(distanceMiles * 2 * IRS_MILEAGE_RATE).toFixed(2)}
                  </p>
                ) : (
                  <p>Under {MILEAGE_THRESHOLD_MILES} mi threshold — no mileage reimbursement required.</p>
                )}
              </div>
            )}
            <Input
              type="number"
              min={0}
              step={0.01}
              value={mileage || ""}
              onChange={(e) => setMileage(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
            <p className="text-[10px] text-muted-foreground">Auto-calculated for jobs 50+ mi from office. Override if needed.</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={updateAssignment.isPending} className="sci-fi-btn text-primary w-full">
            {updateAssignment.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
