import { optimisticAssetHandlers } from "@/hooks/useAssetPatch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Asset, Job, JobStatus, AssetStatus, LostItem, ComputerSpec } from "@/lib/types";

// ─── localStorage cache helpers ───

const CACHE_PREFIX = "gg_cache_";

function writeCache(key: string, data: any) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded – ignore */ }
}

function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw).data as T;
  } catch {
    return undefined;
  }
}

function cachedQuery<T>(queryKey: string, fetcher: () => Promise<T>) {
  return {
    queryKey: [queryKey],
    queryFn: async () => {
      const result = await fetcher();
      writeCache(queryKey, result);
      return result;
    },
    placeholderData: () => readCache<T>(queryKey),
  };
}

// ─── Type mappers (DB → App) ───

function mapEmployee(row: any) {
  const rawRole = row.role ?? "pending";
  return {
    id: row.id,
    name: row.name ?? "",
    user_type: rawRole === "manager" || rawRole === "admin" ? "manager" : rawRole === "operator" ? "operator" : "pending",
    role: rawRole,
    points: row.points ?? 0,
    email: row.email ?? "",
    phone: row.phone ?? "",
    status: row.status ?? "active",
  };
}

function mapAsset(row: any): Asset {
  return {
    id: row.id,
    asset_name: row.asset_name ?? "",
    category: row.category ?? "",
    status: (row.status ?? "available") as AssetStatus,
    color_code: row.color_code ?? "#3b82f6",
    serial: row.serial_number ?? "",
    parent_asset_id: row.parent_asset_id ?? undefined,
    damage_notes: row.damage_notes ?? undefined,
    quantity: row.quantity ?? 1,
    original_value: row.original_value ?? undefined,
    replacement_cost: row.replacement_cost ?? undefined,
    replaced_at: row.replaced_at ?? undefined,
    metadata: (row.metadata as ComputerSpec) ?? undefined,
    cover_image_url: row.cover_image_url ?? undefined,
    gallery_urls: row.gallery_urls ?? [],
    damage_photo_url: row.damage_photo_url ?? undefined,
    home_parent_id: row.home_parent_id ?? undefined,
    original_parent_id: row.original_parent_id ?? undefined,
    is_borrowed: row.is_borrowed ?? false,
    tracking_id: row.tracking_id ?? undefined,
  };
}

function mapJob(row: any): Job {
  return {
    id: row.id,
    job_number: row.job_number ?? "",
    client_name: row.client_name ?? "",
    job_date: row.job_date ?? "",
    status: (row.status ?? "needs_prep") as JobStatus,
    location_type: row.location_type ?? "",
    notes: row.notes ?? undefined,
    call_time: row.call_time ?? undefined,
    address: row.address ?? undefined,
    guaranteed_hours: row.guaranteed_hours ?? undefined,
    distance_miles: row.distance_miles ?? undefined,
    mileage_reimbursement: row.mileage_reimbursement ?? undefined,
  };
}

function mapAssignment(row: any) {
  return {
    id: row.id,
    job_id: row.job_id ?? "",
    operator_id: row.operator_id ?? "",
    asset_ids: (row.asset_ids ?? []) as string[],
    actual_start_time: row.actual_start_time ?? undefined,
    actual_end_time: row.actual_end_time ?? undefined,
    lunch_check_response: row.lunch_check_response ?? undefined,
    lunch_check_time: row.lunch_check_time ?? undefined,
    time_manually_edited: row.time_manually_edited ?? false,
    end_of_day_notes: row.end_of_day_notes ?? undefined,
    receipt_urls: (row.receipt_urls ?? []) as string[],
    expense_amount: row.expense_amount ?? 0,
    mileage_amount: row.mileage_amount ?? 0,
    mission_accepted: row.mission_accepted ?? false,
    missing_asset_notes: row.missing_asset_notes ?? [],
  };
}

// ─── Query hooks ───

export function useClients() {
  return useQuery(cachedQuery("clients", async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("id, company_name, email, phone, contact_name, on_site_contact, street_address, city, state, zip, country")
      .order("company_name");
    if (error) {
      console.error("[useClients] Supabase fetch failed:", error.message, error);
      throw error;
    }
    return data ?? [];
  }));
}


export function useJobs() {
  return useQuery({
    ...cachedQuery("jobs", async () => {
      const { data, error } = await supabase.from("jobs").select("*").order("job_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapJob);
    }),
    staleTime: 10000,
  });
}

export function useAssets() {
  return useQuery({
    ...cachedQuery("assets", async () => {
      const { data, error } = await supabase.from("assets").select("*").order("asset_name");
      if (error) throw error;
      return (data ?? []).map(mapAsset);
    }),
    staleTime: 10000,
  });
}

export function useParentAssets() {
  return useQuery(cachedQuery("parent_assets", async () => {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .is("parent_asset_id", null)
      .order("asset_name");
    if (error) throw error;
    return (data ?? []).map(mapAsset);
  }));
}

export function useEmployees() {
  return useQuery(cachedQuery("employees", async () => {
    const { data, error } = await supabase.from("employees").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map(mapEmployee);
  }));
}

export function useAssignments() {
  return useQuery({
    ...cachedQuery("assignments", async () => {
      const { data, error } = await supabase.from("assignments").select("*");
      if (error) throw error;
      return (data ?? []).map(mapAssignment);
    }),
    staleTime: 10000,
  });
}

export function useLostItems() {
  return useQuery(cachedQuery("lost_items", async () => {
    const { data, error } = await supabase
      .from("sea_of_lost_items")
      .select("*, jobs(client_name, job_number, job_date), employees(name)")
      .order("reported_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any): LostItem => ({
      id: row.id,
      item_name: row.item_name,
      missing_quantity: row.missing_quantity,
      condition: row.condition ?? "missing",
      parent_rig_name: row.parent_rig_name ?? undefined,
      parent_asset_id: row.parent_asset_id ?? undefined,
      job_id: row.job_id ?? undefined,
      operator_id: row.operator_id ?? undefined,
      reported_at: row.reported_at,
      notes: row.notes ?? undefined,
      job: row.jobs ? { id: row.job_id, job_number: row.jobs.job_number ?? "", client_name: row.jobs.client_name ?? "", job_date: row.jobs.job_date ?? "", status: "needs_prep" as any, location_type: "" } : undefined,
      operator_name: row.employees?.name ?? undefined,
    }));
  }));
}

export function useCreateLostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { item_name: string; missing_quantity: number; condition?: string; parent_rig_name?: string; parent_asset_id?: string; job_id?: string; operator_id?: string; notes?: string }) => {
      const { data, error } = await supabase.from("sea_of_lost_items").insert(item).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lost_items"] }),
    onError: (err: any) => toast.error(`Failed to log lost item: ${err.message}`),
  });
}

export function useResolveLostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lostItemId, assetId, restoreQuantity }: { lostItemId: string; assetId?: string; restoreQuantity: number }) => {
      // Restore quantity to the child asset
      if (assetId) {
        const { data: asset, error: fetchErr } = await supabase.from("assets").select("quantity").eq("id", assetId).single();
        if (fetchErr) throw fetchErr;
        const newQty = (asset?.quantity ?? 0) + restoreQuantity;
        const { error: updateErr } = await supabase.from("assets").update({ quantity: newQty }).eq("id", assetId);
        if (updateErr) throw updateErr;
      }
      // Delete the lost item record
      const { error: delErr } = await supabase.from("sea_of_lost_items").delete().eq("id", lostItemId);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lost_items"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: any) => toast.error(`Failed to resolve item: ${err.message}`),
  });
}

export function useReplaceLostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lostItemId, assetId, restoreQuantity, replacementCost }: { lostItemId: string; assetId?: string; restoreQuantity: number; replacementCost: number }) => {
      // Restore quantity to the child asset
      if (assetId) {
        const { data: asset, error: fetchErr } = await supabase.from("assets").select("quantity").eq("id", assetId).single();
        if (fetchErr) throw fetchErr;
        const newQty = (asset?.quantity ?? 0) + restoreQuantity;
        const { error: updateErr } = await supabase.from("assets").update({ quantity: newQty, status: "available" }).eq("id", assetId);
        if (updateErr) throw updateErr;
      }
      // Also save replacement_cost and replaced_at on the asset itself
      if (assetId) {
        const { error: assetCostErr } = await supabase.from("assets").update({ replacement_cost: replacementCost, replaced_at: new Date().toISOString() } as any).eq("id", assetId);
        if (assetCostErr) throw assetCostErr;
      }
      // Update the lost item record with replacement cost and mark resolved
      const { error: updErr } = await supabase.from("sea_of_lost_items").update({ condition: "replaced", replacement_cost: replacementCost } as any).eq("id", lostItemId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lost_items"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: any) => toast.error(`Failed to replace item: ${err.message}`),
  });
}

// ─── Mutation hooks ───

export function useUpdateJobStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (err: any) => toast.error(`Failed to update job: ${err.message}`),
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; job_number?: string; client_name?: string; job_date?: string; location_type?: string; notes?: string; status?: string; call_time?: string; address?: string; distance_miles?: number | null; mileage_reimbursement?: number | null }) => {
      const { error } = await supabase.from("jobs").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (err: any) => toast.error(`Failed to update job: ${err.message}`),
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: { job_number?: string; client_name: string; job_date: string; status?: string; location_type: string; notes?: string; call_time?: string; address?: string; guaranteed_hours?: string; distance_miles?: number | null; mileage_reimbursement?: number | null }) => {
      const { data, error } = await supabase.from("jobs").insert(job).select().single();
      if (error) throw error;
      return mapJob(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (err: any) => toast.error(`Failed to create job: ${err.message}`),
  });
}

export function useUpdateAssetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("assets").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, status }) => optimisticAssetHandlers(qc).onMutate({ id, patch: { status } }),
    onError: (err, vars, ctx) => optimisticAssetHandlers(qc).onError(err, vars, ctx),
    onSettled: (d, e, vars) => optimisticAssetHandlers(qc).onSettled(d, e, vars),
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; asset_name?: string; category?: string; color_code?: string; serial_number?: string; status?: string; damage_notes?: string; original_value?: number | null; quantity?: number; tracking_id?: string | null }) => {
      const { error } = await supabase.from("assets").update(updates).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, ...updates }) => optimisticAssetHandlers(qc).onMutate({ id, patch: updates }),
    onError: (err, vars, ctx) => optimisticAssetHandlers(qc).onError(err, vars, ctx),
    onSettled: (d, e, vars) => optimisticAssetHandlers(qc).onSettled(d, e, vars),
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asset: { asset_name: string; category: string; status?: string; color_code?: string; serial_number?: string; parent_asset_id?: string; quantity?: number; damage_notes?: string; manufacturer?: string; purchased_from?: string; purchase_date?: string; condition?: string; original_value?: number; tracking_id?: string }) => {
      const { data, error } = await supabase.from("assets").insert(asset).select().single();
      if (error) throw error;
      return mapAsset(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
    onError: (err: any) => toast.error(`Failed to create asset: ${err.message}`),
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assignment: { job_id: string; operator_id: string; asset_ids: string[] }) => {
      const { data, error } = await supabase.from("assignments").insert(assignment).select().single();
      if (error) throw error;
      return mapAssignment(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      if (msg.includes("DOUBLE_BOOKING")) {
        toast.error("Conflict: This item is already assigned to another job on this date.");
      } else {
        toast.error(`Failed to create assignment: ${err.message}`);
      }
    },
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; operator_id?: string; asset_ids?: string[]; actual_start_time?: string | null; actual_end_time?: string | null; lunch_check_response?: string; lunch_check_time?: string; time_manually_edited?: boolean; end_of_day_notes?: string; expense_amount?: number; receipt_urls?: string[]; mileage_amount?: number; mission_accepted?: boolean; geofence_flagged?: boolean; geofence_distance_miles?: number | null; checkout_location_url?: string | null; checkin_location_url?: string | null }) => {
      const { error } = await supabase.from("assignments").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      if (msg.includes("DOUBLE_BOOKING")) {
        toast.error("Conflict: This item is already assigned to another job on this date.");
      } else {
        toast.error(`Failed to update assignment: ${err.message}`);
      }
    },
  });
}

export function useCreateAdminNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notification: { operator_id: string; job_id: string; notification_type?: string; message?: string; recipient_role?: string; recipient_id?: string; title?: string }) => {
      const { error } = await supabase.from("admin_notifications").insert(notification);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_notifications"] }),
    onError: (err: any) => toast.error(`Failed to send notification: ${err.message}`),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (err: any) => toast.error(`Failed to delete job: ${err.message}`),
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
    onError: (err: any) => toast.error(`Failed to delete assignment: ${err.message}`),
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: { company_name: string; email?: string; phone?: string; contact_name?: string; on_site_contact?: string }) => {
      const { data, error } = await supabase.from("clients").insert(client).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
    onError: (err: any) => toast.error(`Failed to create client: ${err.message}`),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; company_name?: string; email?: string; phone?: string; contact_name?: string; on_site_contact?: string; street_address?: string; city?: string; state?: string; zip?: string }) => {
      const { error } = await supabase.from("clients").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
    onError: (err: any) => toast.error(`Failed to update client: ${err.message}`),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; email?: string; phone?: string; role?: string }) => {
      const { error } = await supabase.from("employees").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
    onError: (err: any) => toast.error(`Failed to update employee: ${err.message}`),
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employee: { name: string; email: string; phone?: string; role: string }) => {
      const { data, error } = await supabase.from("employees").insert(employee).select().single();
      if (error) throw error;
      return mapEmployee(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
    onError: (err: any) => toast.error(`Failed to add employee: ${err.message}`),
  });
}

export function useCloneAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ originalParentId, newName, includeChildren, allAssets }: { originalParentId: string; newName: string; includeChildren: boolean; allAssets: Asset[] }) => {
      const original = allAssets.find((a) => a.id === originalParentId);
      if (!original) throw new Error("Original asset not found");

      const { data: newParent, error: parentErr } = await supabase.from("assets").insert({
        asset_name: newName,
        category: original.category,
        status: "available",
        color_code: original.color_code,
        quantity: original.quantity,
      }).select().single();
      if (parentErr) throw parentErr;

      let childCount = 0;
      if (includeChildren) {
        const children = allAssets.filter((a) => a.parent_asset_id === originalParentId);
        for (const child of children) {
          const { error: childErr } = await supabase.from("assets").insert({
            asset_name: child.asset_name,
            category: child.category,
            status: "available",
            color_code: child.color_code,
            parent_asset_id: newParent.id,
            quantity: child.quantity,
          });
          if (childErr) throw childErr;
          childCount++;
        }
      }

      return { newParent, childCount };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["parent_assets"] });
    },
    onError: (err: any) => toast.error(`Failed to clone asset: ${err.message}`),
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["parent_assets"] });
    },
    onError: (err: any) => toast.error(`Failed to delete asset: ${err.message}`),
  });
}

export function usePointActivities() {
  return useQuery(cachedQuery("point_activities", async () => {
    const { data, error } = await supabase
      .from("point_activities" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as any[];
  }));
}

export function useAddPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, points, reason, awardSlug }: { employeeId: string; points: number; reason: string; awardSlug?: string }) => {
      // Insert activity
      const { error: actErr } = await supabase.from("point_activities" as any).insert({
        employee_id: employeeId,
        points,
        reason,
        award_slug: awardSlug,
      } as any);
      if (actErr) throw actErr;
      // Increment employee points
      const { data: emp, error: fetchErr } = await supabase.from("employees").select("points").eq("id", employeeId).single();
      if (fetchErr) throw fetchErr;
      const newPts = (emp?.points ?? 0) + points;
      const { error: updErr } = await supabase.from("employees").update({ points: newPts }).eq("id", employeeId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["point_activities"] });
    },
    onError: (err: any) => toast.error(`Failed to add points: ${err.message}`),
  });
}

// ─── Rewards hooks ───

export function useRewards() {
  return useQuery(cachedQuery("rewards", async () => {
    const { data, error } = await supabase
      .from("rewards" as any)
      .select("*")
      .eq("active", true)
      .order("points_cost", { ascending: true });
    if (error) throw error;
    return (data ?? []) as any[];
  }));
}

export function useAllRewards() {
  return useQuery(cachedQuery("all_rewards", async () => {
    const { data, error } = await supabase
      .from("rewards" as any)
      .select("*")
      .order("points_cost", { ascending: true });
    if (error) throw error;
    return (data ?? []) as any[];
  }));
}

export function useRedemptions() {
  return useQuery(cachedQuery("reward_redemptions", async () => {
    const { data, error } = await supabase
      .from("reward_redemptions" as any)
      .select("*, rewards:reward_id(name, emoji), employees:employee_id(name)")
      .order("redeemed_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as any[];
  }));
}

export function useCreateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reward: { name: string; description?: string; emoji?: string; points_cost: number; quantity_available?: number; created_by?: string }) => {
      const { data, error } = await supabase.from("rewards" as any).insert(reward as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rewards"] }); qc.invalidateQueries({ queryKey: ["all_rewards"] }); },
    onError: (err: any) => toast.error(`Failed to create reward: ${err.message}`),
  });
}

export function useUpdateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; emoji?: string; points_cost?: number; quantity_available?: number | null; active?: boolean }) => {
      const { error } = await supabase.from("rewards" as any).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rewards"] }); qc.invalidateQueries({ queryKey: ["all_rewards"] }); },
    onError: (err: any) => toast.error(`Failed to update reward: ${err.message}`),
  });
}

export function useRedeemReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rewardId, employeeId }: { rewardId: string; employeeId: string }) => {
      const { error } = await supabase.rpc("redeem_reward", { _reward_id: rewardId, _employee_id: employeeId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rewards"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["reward_redemptions"] });
    },
    onError: (err: any) => toast.error(`Failed to redeem: ${err.message}`),
  });
}

export function useUpdateRedemption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; fulfilled_at?: string; notes?: string }) => {
      const { error } = await supabase.from("reward_redemptions" as any).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reward_redemptions"] }),
    onError: (err: any) => toast.error(`Failed to update redemption: ${err.message}`),
  });
}
