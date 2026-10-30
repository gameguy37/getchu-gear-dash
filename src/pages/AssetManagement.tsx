import { useAssetPatch } from "@/hooks/useAssetPatch";
import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { BorrowedBadge } from "@/components/BorrowedBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useAssets, useAssignments, useEmployees, useJobs, useUpdateAsset, useUpdateAssetStatus, useCreateAsset, useDeleteAsset, useCloneAsset, useLostItems } from "@/hooks/useSupabaseData";
import { useActivelyCheckedOutAssetIds } from "@/hooks/useAssetAvailability";
import { useAssetNestDnd } from "@/hooks/useAssetNestDnd";
import { useDebounce } from "@/hooks/useDebounce";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { uploadAssetPhoto } from "@/lib/assetPhotos";
import { Asset, AssetStatus, ComputerSpec } from "@/lib/types";
import { Plus, Package, Pencil, Trash2, ChevronRight, ShieldAlert, Copy, DollarSign, Laptop, Monitor, CheckCircle2, AlertTriangle, XCircle, Camera, X, ArrowLeftRight, GripVertical, RotateCcw, ImageIcon, Radar } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { AssetPhoto } from "@/components/AssetPhoto";
import { AdminManualCheckoutDialog } from "@/components/AdminManualCheckoutDialog";
import { KanbanSkeleton } from "@/components/LoadingSkeleton";
import { cn, getAssetDisplayName } from "@/lib/utils";
import { DamagePhotoDialog } from "@/components/DamagePhotoDialog";
import { BorrowItemDialog } from "@/components/BorrowItemDialog";
import { LendToKitDialog } from "@/components/LendToKitDialog";
import { ArrowRightLeft, Undo2 } from "lucide-react";
import { logAssetAction, kitLabel } from "@/lib/assetLogs";
import { ComputerSpecFields } from "@/components/ComputerSpecFields";
import { AssetHistoryTimeline } from "@/components/AssetHistoryTimeline";
import { AssetNestMoveDialog } from "@/components/AssetNestMoveDialog";

const COLUMNS: { id: AssetStatus; label: string }[] = [
  { id: "available", label: "Available" },
  { id: "checked_out", label: "Checked Out" },
  { id: "in_transit", label: "In Transit" },
  { id: "iffy", label: "Iffy" },
  { id: "missing", label: "Missing" },
  { id: "broken", label: "Broken" },
];

const DEFAULT_CATEGORIES = ["Through The Lens", "Presidential", "Robotic Presidential", "Computer Kit", "Cable Bag", "Direct View Kit", "Big Monitor", "Wedgeprompt (tm)", "DSM", "Tour Box", "Above The Lens", "Wireless Rigs"];

const statusLabel = (s: AssetStatus) => s.replace(/_/g, " ");

// ─── Build parent→children map ───
function buildHierarchy(assets: Asset[]) {
  const childrenMap = new Map<string, Asset[]>();
  const parentIds = new Set<string>();

  assets.forEach((a) => {
    if (a.parent_asset_id) {
      const siblings = childrenMap.get(a.parent_asset_id) ?? [];
      siblings.push(a);
      childrenMap.set(a.parent_asset_id, siblings);
      parentIds.add(a.parent_asset_id);
    }
  });

  // Sort children by name
  childrenMap.forEach((children, pid) => {
    childrenMap.set(pid, [...children].sort((a, b) => (a.asset_name ?? "").localeCompare(b.asset_name ?? "")));
  });

  return { childrenMap, parentIds };
}

// Recursively collect all descendants (children, grandchildren, …) of a parent
function getAllDescendants(parentId: string, childrenMap: Map<string, Asset[]>): Asset[] {
  const out: Asset[] = [];
  const stack = [...(childrenMap.get(parentId) ?? [])];
  while (stack.length) {
    const node = stack.shift()!;
    out.push(node);
    const grand = childrenMap.get(node.id);
    if (grand?.length) stack.push(...grand);
  }
  return out;
}

function AssetCard({
  asset,
  index,
  onEdit,
  onDelete,
  onClone,
  onClick,
  onEditThumbnail,
  operatorName,
  childCount,
  coverUrl,
}: {
  asset: Asset;
  index: number;
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  onClone: (asset: Asset) => void;
  onClick: (asset: Asset) => void;
  onEditThumbnail: (asset: Asset) => void;
  operatorName: string | null;
  childCount: number;
  coverUrl: string | null;
}) {
  return (
    <Draggable draggableId={asset.id} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
          <Card
            className={cn(
              "p-3 mb-2 cursor-grab active:cursor-grabbing transition-shadow hover:ring-1 hover:ring-primary/20",
              snapshot.isDragging && "shadow-lg ring-2 ring-primary/30"
            )}
            onClick={() => onClick(asset)}
          >
            <div className="flex gap-2">
              <div className="w-1 rounded-full flex-shrink-0" style={{ backgroundColor: asset.color_code }} />
              <div className="flex-1 min-w-0">
                <div className="w-full h-24 rounded-md bg-muted flex items-center justify-center mb-2 relative overflow-hidden">
                  {asset.cover_image_url ? (
                    <AssetPhoto src={asset.cover_image_url} alt={asset.asset_name} className="w-full h-full object-cover" />
                  ) : coverUrl ? (
                    <AssetPhoto src={coverUrl} alt={asset.asset_name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground" />
                  )}
                  <div className="absolute top-1 right-1 flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditThumbnail(asset); }}
                      className="p-2 rounded-md bg-background/70 backdrop-blur-sm hover:bg-primary/20 transition-colors"
                      title="Change thumbnail"
                    >
                      <ImageIcon className="h-4 w-4 text-primary" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onClone(asset); }}
                      className="p-2 rounded-md bg-background/70 backdrop-blur-sm hover:bg-primary/20 transition-colors"
                      title="Clone"
                    >
                      <Copy className="h-4 w-4 text-primary" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(asset); }}
                      className="p-2 rounded-md bg-background/70 backdrop-blur-sm hover:bg-background/90 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(asset); }}
                      className="p-2 rounded-md bg-background/70 backdrop-blur-sm hover:bg-destructive/20 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground truncate">{asset.asset_name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                    {asset.category}
                  </span>
                  {childCount > 0 && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      {childCount} child{childCount !== 1 ? "ren" : ""}
                    </span>
                  )}
                </div>
                {operatorName && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">↳ {operatorName}</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </Draggable>
  );
}

// ─── Child edit row in unified modal ───
interface ChildEditRow {
  id: string;
  asset_name: string;
  quantity: number;
  status: AssetStatus;
  color_code: string;
  damage_notes: string;
  original_value: number | null;
  serial: string;
  metadata: ComputerSpec;
  isNew?: boolean;
  isDeleted?: boolean;
}

// ─── Grandchild edit row (sub-items attached to a child, e.g. adapter accessories) ───
interface GrandchildEditRow {
  id: string;            // real uuid OR `new-…` placeholder
  asset_name: string;
  quantity: number;
  original_value: number | null;
  serial: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

export default function AssetManagement() {
  const qc = useQueryClient();
  const patchAsset = useAssetPatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, employee } = useAuth();
  const { data: assets = [], isLoading } = useAssets();
  const CATEGORIES = useMemo(
    () => ["All", ...Array.from(new Set([...DEFAULT_CATEGORIES, ...assets.map((a) => a.category).filter((c): c is string => !!c)]))],
    [assets]
  );
  const { data: assignments = [] } = useAssignments();
  const { data: employees = [] } = useEmployees();
  const { data: lostItems = [] } = useLostItems();
  const activelyCheckedOutIds = useActivelyCheckedOutAssetIds(assignments);
  const updateAssetMutation = useUpdateAsset();
  const updateAssetStatusMutation = useUpdateAssetStatus();
  const createAssetMutation = useCreateAsset();
  const deleteAssetMutation = useDeleteAsset();
  const cloneAssetMutation = useCloneAsset();
  const [cloneTarget, setCloneTarget] = useState<Asset | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneChildren, setCloneChildren] = useState(true);

  // Realtime subscription: auto-refetch assets when changed by operators
  useEffect(() => {
    const channel = supabase
      .channel("assets-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "assets" }, () => {
        qc.invalidateQueries({ queryKey: ["assets"] });
        qc.invalidateQueries({ queryKey: ["parent_assets"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Cover photo URLs for parent assets
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!assets.length) return;
    const parents = assets.filter(a => !a.parent_asset_id);
    const loadCovers = async () => {
      const map: Record<string, string> = {};
      await Promise.all(parents.map(async (a) => {
        // Try "Front" photo first, fallback to any file
        const { data: files } = await supabase.storage.from("asset-photos").list(a.id, { limit: 10 });
        if (files && files.length > 0) {
          const front = files.find(f => f.name.toLowerCase().startsWith("front"));
          const pick = front || files[0];
          // Store the storage path; AssetPhoto resolves a fresh signed URL.
          map[a.id] = `${a.id}/${pick.name}`;
        }
      }));
      setCoverUrls(map);
    };
    loadCovers();
  }, [assets]);

  const [filter, setFilter] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualCheckoutOpen, setManualCheckoutOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [lendOpen, setLendOpen] = useState(false);
  const [detailTotalValue, setDetailTotalValue] = useState<number | null>(null);
  const [editTotalValue, setEditTotalValue] = useState<number | null>(null);

  // Cascade-status dialog: when a parent with descendants is marked missing/broken,
  // ask if we should propagate the same status to ALL children + grandchildren.
  const [cascadeTarget, setCascadeTarget] = useState<{ asset: Asset; status: AssetStatus; descendants: Asset[] } | null>(null);

  // Grandchildren: editable list per child row, keyed by the child's id (string).
  // For brand-new children (id starts with "new-") this stays empty until parent saves.
  const [grandchildrenByChild, setGrandchildrenByChild] = useState<Record<string, GrandchildEditRow[]>>({});

  // Deep-link: open asset detail when ?asset=<id> is present (used by Sea of Lost / Flagged Gear)
  useEffect(() => {
    const target = searchParams.get("asset");
    if (!target || !assets.length) return;
    const found = assets.find((a) => a.id === target);
    if (found) {
      setDetailAsset(found);
      // Clear param so closing/reopening doesn't refire
      const next = new URLSearchParams(searchParams);
      next.delete("asset");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, assets, setSearchParams]);

  // Fetch the calculated hierarchical total value for the currently viewed asset
  useEffect(() => {
    if (!detailAsset) {
      setDetailTotalValue(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("calculate_total_asset_value" as any, { base_asset_id: detailAsset.id } as any);
      if (cancelled) return;
      if (error) {
        console.error("calculate_total_asset_value failed:", error);
        setDetailTotalValue(null);
        return;
      }
      const value =
        typeof data === "number"
          ? data
          : (data as any)?.calculate_total_asset_value ?? (data as any)?.total ?? null;
      setDetailTotalValue(value);
    })();
    return () => { cancelled = true; };
  }, [detailAsset]);

  // Unified edit modal state
  const [editParent, setEditParent] = useState<Asset | null>(null);
  const [editParentForm, setEditParentForm] = useState<Partial<Asset>>({});
  const [editChildren, setEditChildren] = useState<ChildEditRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editStep, setEditStep] = useState(1);
  // ─── Auto-draft + debounced autosave ───
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [creatingDraft, setCreatingDraft] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const touchedRef = useRef(false);
  const baselineRef = useRef<string>("");
  const editIdRef = useRef<string | null>(null);
  const autosaveRef = useRef<null | (() => Promise<boolean>)>(null);
  const formSnapshot = useMemo(
    () => JSON.stringify({ p: editParentForm, c: editChildren, g: grandchildrenByChild }),
    [editParentForm, editChildren, grandchildrenByChild]
  );
  const debouncedSnapshot = useDebounce(formSnapshot, 700);

  // Reset the autosave baseline whenever a different asset is opened
  useEffect(() => {
    if (editParent && editParent.id !== editIdRef.current) {
      editIdRef.current = editParent.id;
      baselineRef.current = formSnapshot;
      setSaveStatus("idle");
    }
    if (!editParent) editIdRef.current = null;
  }, [editParent, formSnapshot]);

  // Fetch the calculated hierarchical total value for the asset currently in the edit modal
  useEffect(() => {
    if (!editParent) {
      setEditTotalValue(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("calculate_total_asset_value" as any, { base_asset_id: editParent.id } as any);
      if (cancelled) return;
      if (error) {
        console.error("calculate_total_asset_value failed:", error);
        setEditTotalValue(null);
        return;
      }
      const value =
        typeof data === "number"
          ? data
          : (data as any)?.calculate_total_asset_value ?? (data as any)?.total ?? null;
      setEditTotalValue(value);
    })();
    return () => { cancelled = true; };
  }, [editParent]);

  // Debounced background save — fires once the user pauses typing
  useEffect(() => {
    if (!editParent) return;
    if (debouncedSnapshot !== formSnapshot) return; // still typing
    if (debouncedSnapshot === baselineRef.current) return; // nothing changed
    touchedRef.current = true;
    const snap = formSnapshot;
    (async () => {
      setSaveStatus("saving");
      const ok = await autosaveRef.current?.();
      baselineRef.current = snap;
      setSaveStatus(ok === false ? "idle" : "saved");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSnapshot]);
  // Per-computer photos in edit mode
  const [editComputerPhotos, setEditComputerPhotos] = useState<Record<string, { file: File | null; preview: string | null }>>({});
  const editComputerPhotoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Collection photos in edit mode
  const [editCollectionPhotos, setEditCollectionPhotos] = useState<{ label: string; file: File | null; preview: string | null; existingUrl?: string }[]>([]);
  const editCollectionPhotoRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Cover photo in edit mode
  const [editCoverPhoto, setEditCoverPhoto] = useState<{ file: File | null; preview: string | null }>({ file: null, preview: null });
  const editCoverPhotoRef = useRef<HTMLInputElement | null>(null);
  // Admin-only purchase receipt
  const [editReceipt, setEditReceipt] = useState<{ file: File | null; existingUrl: string | null; cleared: boolean; notes: string }>({ file: null, existingUrl: null, cleared: false, notes: "" });
  const editReceiptRef = useRef<HTMLInputElement | null>(null);

  // Quick thumbnail edit (from main grid card)
  const [thumbnailTarget, setThumbnailTarget] = useState<Asset | null>(null);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const quickThumbInputRef = useRef<HTMLInputElement | null>(null);

  const handleQuickThumbnailClick = (asset: Asset) => {
    setThumbnailTarget(asset);
    // Defer to ensure ref is set before triggering click
    setTimeout(() => quickThumbInputRef.current?.click(), 0);
  };

  const handleQuickThumbnailFile = async (file: File) => {
    if (!thumbnailTarget) return;
    setThumbnailUploading(true);
    try {
      const path = await uploadAssetPhoto(thumbnailTarget.id, file, "cover");
      const { error: updErr } = await supabase.from("assets").update({ cover_image_url: path } as any).eq("id", thumbnailTarget.id);
      if (updErr) throw updErr;
      toast.success("Thumbnail updated");
      qc.invalidateQueries({ queryKey: ["assets"] });
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setThumbnailUploading(false);
      setThumbnailTarget(null);
    }
  };

  // Damage photo dialog state
  const [damagePhotoTarget, setDamagePhotoTarget] = useState<{ id: string; name: string } | null>(null);
  // Borrow item dialog state
  const [borrowDialogParent, setBorrowDialogParent] = useState<{ id: string; name: string } | null>(null);

  const { childrenMap, parentIds } = useMemo(() => buildHierarchy(assets), [assets]);

  // Drag-and-drop nesting (drop asset A onto asset B → B becomes A's parent)
  const nestDnd = useAssetNestDnd(assets);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });


  // Compute effective status: "checked_out" only if actively checked out RIGHT NOW
  const getEffectiveStatus = (asset: Asset): AssetStatus => {
    if (asset.status === "checked_out") {
      // Only show as checked_out if there's an active assignment (clocked in, not clocked out)
      return activelyCheckedOutIds.has(asset.id) ? "checked_out" : "available";
    }
    return asset.status;
  };

  if (isLoading) return <KanbanSkeleton />;

  // Only show top-level assets (no parent) in the kanban; children are nested via the edit modal
  const topLevelAssets = filter === "All"
    ? assets.filter((a) => !a.parent_asset_id)
    : assets.filter((a) => !a.parent_asset_id && a.category === filter);

  function getAssignedOperator(assetId: string) {
    // Only show operator if actively checked out
    if (!activelyCheckedOutIds.has(assetId)) return null;
    const asgn = assignments.find((a) => a.asset_ids.includes(assetId) && a.actual_start_time && !a.actual_end_time);
    if (!asgn) return null;
    return employees.find((u) => u.id === asgn.operator_id)?.name ?? null;
  }

  // ─── Open unified edit modal ───
  const openEdit = async (asset: Asset) => {
    const target = asset.parent_asset_id
      ? assets.find((a) => a.id === asset.parent_asset_id) ?? asset
      : asset;

    setEditParent(target);
    setEditParentForm({ ...target });
    setEditStep(1);

    const children = childrenMap.get(target.id) ?? [];
    setEditChildren(
      children.map((c) => ({
        id: c.id,
        asset_name: c.asset_name,
        quantity: c.quantity ?? 1,
        status: c.status,
        color_code: c.color_code,
        damage_notes: c.damage_notes ?? "",
        original_value: c.original_value ?? null,
        serial: c.serial ?? "",
        metadata: c.metadata ?? {},
      }))
    );
    setDetailAsset(null);

    // Build grandchildren map for each child (sub-items / accessories)
    const gcMap: Record<string, GrandchildEditRow[]> = {};
    for (const child of children) {
      const grands = childrenMap.get(child.id) ?? [];
      gcMap[child.id] = grands.map((g) => ({
        id: g.id,
        asset_name: g.asset_name,
        quantity: g.quantity ?? 1,
        original_value: g.original_value ?? null,
        serial: g.serial ?? "",
      }));
    }
    setGrandchildrenByChild(gcMap);

    // Load existing per-computer photos
    const photoMap: Record<string, { file: null; preview: string | null }> = {};
    for (const child of children) {
      const { data: files } = await supabase.storage.from("asset-photos").list(child.id);
      if (files && files.length > 0) {
        photoMap[child.id] = { file: null, preview: `${child.id}/${files[0].name}` };
      }
    }
    setEditComputerPhotos(photoMap);

    // Load existing collection photos (store storage paths; AssetPhoto resolves them)
    const PHOTO_VIEWS = ["Front", "Side", "Back", "Detail"];
    const { data: parentFiles } = await supabase.storage.from("asset-photos").list(target.id);
    const collectionPhotos = PHOTO_VIEWS.map((label) => {
      const match = parentFiles?.find((f) => f.name.toLowerCase().startsWith(label.toLowerCase()));
      if (match) {
        const path = `${target.id}/${match.name}`;
        return { label, file: null, preview: path, existingUrl: path };
      }
      return { label, file: null, preview: null };
    });
    setEditCollectionPhotos(collectionPhotos);

    // Load existing cover photo
    setEditCoverPhoto({ file: null, preview: target.cover_image_url ?? null });
    // Load existing purchase receipt (admin-only)
    setEditReceipt({
      file: null,
      existingUrl: (target as any).purchase_receipt_url ?? null,
      cleared: false,
      notes: (target as any).purchase_receipt_notes ?? "",
    });
  };

  // ─── Auto-draft creation: the row exists in the DB the moment you click "Add Gear" ───
  const createDraftAsset = async () => {
    setCreatingDraft(true);
    try {
      const category = filter !== "All" ? filter : "Prompter";
      const { data, error } = await supabase
        .from("assets")
        .insert({
          asset_name: "Untitled Asset",
          category,
          status: "available",
          color_code: "#3b82f6",
          quantity: 1,
        } as any)
        .select("*")
        .single();
      if (error || !data) throw error ?? new Error("Could not create the item");
      draftIdRef.current = data.id;
      touchedRef.current = false;
      await qc.invalidateQueries({ queryKey: ["assets"] });
      await openEdit({
        id: data.id,
        asset_name: data.asset_name ?? "Untitled Asset",
        category,
        status: "available",
        color_code: "#3b82f6",
        quantity: 1,
      } as Asset);
    } catch (err: any) {
      toast.error(`Couldn't start a new item: ${err.message}`);
    } finally {
      setCreatingDraft(false);
    }
  };

  // Upload any pending photos for the asset currently being edited.
  // Shared by the "Done" button and by closing the modal, so images are never lost.
  const flushPendingPhotos = async (parent: Asset | null) => {
    for (const [childId, photo] of Object.entries(editComputerPhotos)) {
      if (photo.file) {
        const p = await uploadAssetPhoto(childId, photo.file, "photo").catch(() => null);
        if (p) await supabase.from("assets").update({ cover_image_url: p } as any).eq("id", childId);
      }
    }
    if (!parent) return;
    for (const photo of editCollectionPhotos) {
      if (photo.file) {
        await uploadAssetPhoto(parent.id, photo.file, photo.label).catch((e: any) =>
          toast.error(`${photo.label} photo upload failed: ${e.message}`)
        );
      }
    }
    if (editCoverPhoto.file) {
      const path = await uploadAssetPhoto(parent.id, editCoverPhoto.file, "cover").catch((e: any) => {
        toast.error(`Cover photo upload failed: ${e.message}`);
        return null;
      });
      if (path) await supabase.from("assets").update({ cover_image_url: path } as any).eq("id", parent.id);
    } else if (editCoverPhoto.preview === null && parent.cover_image_url) {
      await supabase.from("assets").update({ cover_image_url: null } as any).eq("id", parent.id);
    }
  };

  const hasPendingPhotos = () =>
    !!editCoverPhoto.file ||
    editCollectionPhotos.some((p) => p.file) ||
    Object.values(editComputerPhotos).some((p) => p.file);

  // ─── Close the edit modal; flush unsaved edits/photos, then remove a truly untouched draft ───
  const closeEdit = async (opts?: { alreadyFlushed?: boolean }) => {
    const closingParent = editParent;
    const closingId = closingParent?.id ?? null;
    const pendingPhotos = !opts?.alreadyFlushed && hasPendingPhotos();
    // Anything typed within the debounce window still counts as a change
    const pendingEdits = !opts?.alreadyFlushed && formSnapshot !== baselineRef.current;
    if (pendingEdits) touchedRef.current = true;
    if (pendingPhotos) touchedRef.current = true;

    const wasUntouchedDraft = !!closingId && draftIdRef.current === closingId && !touchedRef.current;
    setEditParent(null);
    setSaveStatus("idle");
    draftIdRef.current = null;
    touchedRef.current = false;

    if (wasUntouchedDraft && closingId) {
      await supabase.from("assets").delete().eq("id", closingId);
      qc.invalidateQueries({ queryKey: ["assets"] });
      return;
    }
    if (pendingEdits) {
      await autosaveRef.current?.();
      baselineRef.current = formSnapshot;
    }
    if (pendingPhotos) {
      await flushPendingPhotos(closingParent);
    }
    if (pendingEdits || pendingPhotos) {
      qc.invalidateQueries({ queryKey: ["assets"] });
    }
  };

  // Children are inserted immediately so sub-items can be attached right away
  const addChildRow = async () => {
    if (!editParent) return;
    const isCompKit = editParentForm.category === "Computer Kit";
    const name = isCompKit ? `Computer ${editChildren.filter((c) => !c.isDeleted).length + 1}` : "Untitled Item";
    const color = editParentForm.color_code ?? "#3b82f6";
    const { data, error } = await supabase
      .from("assets")
      .insert({
        asset_name: name,
        category: editParentForm.category ?? "Prompter",
        status: "available",
        color_code: color,
        parent_asset_id: editParent.id,
        quantity: 1,
      } as any)
      .select("id")
      .single();
    if (error || !data) {
      toast.error(`Couldn't add the item: ${error?.message ?? "unknown error"}`);
      return;
    }
    touchedRef.current = true;
    setGrandchildrenByChild((prev) => ({ ...prev, [data.id]: [] }));
    setEditChildren((prev) => [
      {
        id: data.id,
        asset_name: name,
        quantity: 1,
        status: "available" as AssetStatus,
        color_code: color,
        damage_notes: "",
        original_value: null,
        serial: "",
        metadata: {},
      },
      ...prev,
    ]);
    qc.invalidateQueries({ queryKey: ["assets"] });
  };

  const updateChildRow = (idx: number, updates: Partial<ChildEditRow>) => {
    setEditChildren((prev) => prev.map((c, i) => (i === idx ? { ...c, ...updates } : c)));
  };

  const markChildDeleted = (idx: number) => {
    setEditChildren((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        if (c.isNew) return { ...c, isDeleted: true }; // just mark, will filter on save
        return { ...c, isDeleted: true };
      })
    );
  };

  // ─── Grandchild (sub-item) helpers — inserted immediately, no "save first" needed ───
  const addGrandchild = async (childId: string) => {
    const child = editChildren.find((c) => c.id === childId);
    const { data, error } = await supabase
      .from("assets")
      .insert({
        asset_name: "Untitled Sub-item",
        category: editParentForm.category ?? "Accessory",
        status: "available",
        color_code: child?.color_code ?? editParentForm.color_code ?? "#3b82f6",
        parent_asset_id: childId,
        quantity: 1,
      } as any)
      .select("id")
      .single();
    if (error || !data) {
      toast.error(`Couldn't add the sub-item: ${error?.message ?? "unknown error"}`);
      return;
    }
    touchedRef.current = true;
    setGrandchildrenByChild((prev) => ({
      ...prev,
      [childId]: [
        ...(prev[childId] ?? []),
        { id: data.id, asset_name: "Untitled Sub-item", quantity: 1, original_value: null, serial: "" },
      ],
    }));
    qc.invalidateQueries({ queryKey: ["assets"] });
  };

  const updateGrandchild = (childId: string, idx: number, updates: Partial<GrandchildEditRow>) => {
    setGrandchildrenByChild((prev) => ({
      ...prev,
      [childId]: (prev[childId] ?? []).map((g, i) => (i === idx ? { ...g, ...updates } : g)),
    }));
  };

  const markGrandchildDeleted = (childId: string, idx: number) => {
    setGrandchildrenByChild((prev) => ({
      ...prev,
      [childId]: (prev[childId] ?? []).map((g, i) => (i === idx ? { ...g, isDeleted: true } : g)),
    }));
  };

  // ─── Persist everything (silent = background autosave, no toast, keeps modal open) ───
  const handleSaveAll = async (opts?: { silent?: boolean }): Promise<boolean> => {
    const silent = opts?.silent ?? false;
    if (!editParent) return false;
    setIsSaving(true);

    try {
      // 1. Update parent
      const parentOrigVal = editParentForm.original_value;
      await updateAssetMutation.mutateAsync({
        id: editParent.id,
        asset_name: editParentForm.asset_name,
        category: editParentForm.category,
        color_code: editParentForm.color_code,
        serial_number: editParentForm.serial,
        damage_notes: editParentForm.damage_notes,
        original_value: parentOrigVal != null ? parentOrigVal : null,
        tracking_id: editParentForm.tracking_id?.trim() || null,
      });

      // 2. Process children
      for (const child of editChildren) {
        if (child.isDeleted) {
          if (!child.isNew) {
            // Delete from DB
            const { error } = await supabase.from("assets").delete().eq("id", child.id);
            if (error) throw error;
          }
          continue;
        }

        if (child.isNew) {
          // Insert new child
          await createAssetMutation.mutateAsync({
            asset_name: child.asset_name,
            category: editParentForm.category ?? "Prompter",
            status: child.status,
            color_code: child.color_code,
            parent_asset_id: editParent.id,
            quantity: child.quantity,
            original_value: child.original_value ?? undefined,
          });
          // Save metadata / serial separately if present
          if (Object.keys(child.metadata || {}).length > 0 || child.serial) {
            // We need to get the newly created asset id - refetch
            const { data: created } = await supabase.from("assets")
              .select("id")
              .eq("parent_asset_id", editParent.id)
              .eq("asset_name", child.asset_name)
              .order("id", { ascending: false })
              .limit(1)
              .single();
            if (created) {
              await supabase.from("assets").update({ metadata: child.metadata as any, serial_number: child.serial || null } as any).eq("id", created.id);
            }
          }
        } else {
          // Update existing child
          await updateAssetMutation.mutateAsync({
            id: child.id,
            asset_name: child.asset_name,
            color_code: child.color_code,
            damage_notes: child.damage_notes || undefined,
            original_value: child.original_value ?? null,
            serial_number: child.serial || undefined,
          });
          // Save metadata
          await supabase.from("assets").update({ metadata: child.metadata as any } as any).eq("id", child.id);
          // Update quantity
          const { error: qErr } = await supabase.from("assets").update({ quantity: child.quantity }).eq("id", child.id);
          if (qErr) throw qErr;
          // Update status separately if changed
          const existing = assets.find((a) => a.id === child.id);
          if (existing && existing.status !== child.status) {
            await updateAssetStatusMutation.mutateAsync({ id: child.id, status: child.status });
          }

          // Persist grandchildren (sub-items) for existing children only.
          // For brand-new children, the row needs an id first — they can add sub-items after first save.
          const grands = grandchildrenByChild[child.id] ?? [];
          for (const g of grands) {
            if (g.isDeleted) {
              if (!g.isNew) {
                await supabase.from("assets").delete().eq("id", g.id);
              }
              continue;
            }
            if (!g.asset_name?.trim()) continue;
            if (g.isNew) {
              await supabase.from("assets").insert({
                asset_name: g.asset_name.trim(),
                category: editParentForm.category ?? "Accessory",
                status: "available",
                color_code: child.color_code,
                parent_asset_id: child.id,
                quantity: g.quantity,
                original_value: g.original_value ?? null,
                serial_number: g.serial || null,
              } as any);
            } else {
              await supabase.from("assets").update({
                asset_name: g.asset_name.trim(),
                quantity: g.quantity,
                original_value: g.original_value ?? null,
                serial_number: g.serial || null,
              } as any).eq("id", g.id);
            }
          }
        }
      }

      return true;
    } catch (err: any) {
      if (!silent) toast.error(`Save failed: ${err.message}`);
      else toast.error(`Autosave failed: ${err.message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Expose the silent saver to the debounced autosave effect above
  autosaveRef.current = () => handleSaveAll({ silent: true });

  const handleDeleteParent = async () => {
    if (!editParent) return;

    const confirmed = window.confirm(
      `Delete "${editParent.asset_name}" and all of its child assets? This cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteAssetMutation.mutateAsync(editParent.id);
      toast.success(`Deleted ${editParent.asset_name} and nested child assets.`);
      setEditParent(null);
      setDetailAsset(null);
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;
    const newStatus = destination.droppableId as AssetStatus;
    const asset = assets.find((a) => a.id === draggableId);

    // If dragging to "broken", trigger damage photo dialog
    if (newStatus === "broken" && asset) {
      setDamagePhotoTarget({ id: asset.id, name: asset.asset_name });
    }

    updateAssetStatusMutation.mutate(
      { id: draggableId, status: newStatus },
      { onSuccess: () => { if (asset) toast.success(`${asset.asset_name} → ${newStatus.replace(/_/g, " ")}`); } }
    );

    // If marking a parent missing/broken, offer to cascade to all descendants
    if (asset && (newStatus === "missing" || newStatus === "broken")) {
      const descendants = getAllDescendants(asset.id, childrenMap);
      if (descendants.length > 0) {
        setCascadeTarget({ asset, status: newStatus, descendants });
      }
    }
  };

  // Apply the cascaded status to every descendant of the cascadeTarget
  const applyCascadeStatus = async () => {
    if (!cascadeTarget) return;
    const { status, descendants } = cascadeTarget;
    try {
      const ids = descendants.map((d) => d.id);
      const { error } = await supabase.from("assets").update({ status }).in("id", ids);
      if (error) throw error;
      toast.success(`Marked ${ids.length} sub-item${ids.length !== 1 ? "s" : ""} as ${status}`);
      qc.invalidateQueries({ queryKey: ["assets"] });
    } catch (err: any) {
      toast.error(`Cascade failed: ${err.message}`);
    } finally {
      setCascadeTarget(null);
    }
  };

  // Apply a patch to the local panels (detail + editor) for one item.
  const patchLocal = (id: string, patch: Partial<Asset>) => {
    setEditParent((current) => current?.id === id ? { ...current, ...patch } : current);
    setDetailAsset((current) => current?.id === id ? { ...current, ...patch } : current);
  };
  const borrowFields = (a: Asset): Partial<Asset> => ({
    parent_asset_id: a.parent_asset_id, original_parent_id: a.original_parent_id, home_parent_id: a.home_parent_id, is_borrowed: a.is_borrowed,
  });

  // Return borrowed item to its home kit (or top level if it had no home) — optimistic.
  const handleReturnToHome = (item: Asset) => {
    const originalParentId = item.original_parent_id ?? item.home_parent_id ?? null;
    if (!originalParentId && !item.is_borrowed) return;
    const nameOf = (id?: string | null) => (id ? assets.find((a) => a.id === id)?.asset_name : null);
    const patch: Partial<Asset> = { parent_asset_id: originalParentId ?? undefined, original_parent_id: undefined, home_parent_id: undefined, is_borrowed: false };
    const prev = borrowFields(item);
    patchLocal(item.id, patch);
    patchAsset.mutate(
      { id: item.id, patch, log: { action: "Returned", details: `Returned from ${kitLabel(nameOf(item.parent_asset_id))} to ${kitLabel(nameOf(originalParentId))}` } },
      { onError: () => patchLocal(item.id, prev) }
    );
    toast.success(originalParentId ? `${item.asset_name} returned to ${kitLabel(nameOf(originalParentId))}!` : `${item.asset_name} returned to top level!`);
  };
  const handleMakePermanent = (item: Asset) => {
    const here = item.parent_asset_id ? assets.find((a) => a.id === item.parent_asset_id)?.asset_name : null;
    const patch: Partial<Asset> = { original_parent_id: undefined, home_parent_id: undefined, is_borrowed: false };
    const prev = borrowFields(item);
    patchLocal(item.id, patch);
    patchAsset.mutate(
      { id: item.id, patch, log: { action: "Made Permanent", details: `Now lives permanently in ${kitLabel(here)}` } },
      { onError: () => patchLocal(item.id, prev) }
    );
    toast.success(`${item.asset_name} now lives here permanently.`);
  };
  const detailChildren = detailAsset ? (childrenMap.get(detailAsset.id) ?? []) : [];
  // Also find items that were borrowed FROM this kit (loaned out)
  const loanedOutItems = detailAsset ? assets.filter(a => a.home_parent_id === detailAsset.id && a.parent_asset_id !== detailAsset.id) : [];
  const visibleChildren = editChildren.filter((c) => !c.isDeleted);

  // ─── Recursive, drag-nestable asset row (supports Parent → Sub-Kit → Item) ───
  function renderAssetRow(asset: Asset, depth: number) {
    const eff = getEffectiveStatus(asset);
    const pill =
      eff === "available" || eff === "in_transit"
        ? { label: eff === "in_transit" ? "In Transit" : "Available", cls: "bg-green-500/10 text-green-400" }
        : eff === "checked_out"
        ? { label: "Deployed", cls: "bg-blue-500/10 text-blue-400" }
        : { label: eff === "iffy" ? "Iffy" : eff === "missing" ? "Missing" : "Broken", cls: "bg-red-500/10 text-red-400" };
    const operatorName = eff === "checked_out" ? getAssignedOperator(asset.id) : null;
    const kids = childrenMap.get(asset.id) ?? [];
    const childCount = kids.length;
    const cover = asset.cover_image_url || coverUrls[asset.id] || null;
    const isOpen = expandedRows.has(asset.id);
    const isOver = nestDnd.overId === asset.id;
    const isDragging = nestDnd.draggingId === asset.id;

    return (
      <div key={asset.id}>
        <div
          role="button"
          tabIndex={0}
          {...nestDnd.getDragProps(asset.id)}
          {...nestDnd.getDropProps(asset.id)}
          onClick={() => setDetailAsset(asset)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setDetailAsset(asset);
            }
          }}
          style={{ marginLeft: depth * 18 }}
          className={cn(
            "group/row flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-white/5 last:border-b-0 hover:bg-white/5 active:bg-white/10 transition-all cursor-pointer focus:outline-none focus-visible:bg-white/5",
            depth > 0 && "rounded-r-2xl border-l border-l-white/10",
            isDragging && "opacity-40",
            isOver && "bg-blue-500/20 ring-2 ring-blue-400/70 rounded-2xl shadow-[0_0_24px_hsl(211_100%_50%/0.35)]"
          )}
        >
          {/* Grab handle */}
          <span
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-300 transition-colors"
            title="Drag onto another item to nest it"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </span>

          {/* Thumbnail */}
          <div className={cn("rounded-lg bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0", depth > 0 ? "h-8 w-8" : "h-10 w-10")}>
            {cover ? (
              <AssetPhoto src={cover} alt={asset.asset_name} className="h-full w-full object-cover" />
            ) : (
              <Package className={depth > 0 ? "h-3.5 w-3.5 text-gray-500" : "h-4 w-4 text-gray-500"} />
            )}
          </div>

          {/* Color stripe */}
          <div className="w-0.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: asset.color_code }} />

          {/* Name + secondary */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={cn("font-semibold text-white truncate", depth > 0 ? "text-[13px]" : "text-sm")}>{asset.asset_name}</p>
              {(asset.quantity ?? 1) > 1 && (
                <span className="text-[10px] font-bold text-blue-300 flex-shrink-0">×{asset.quantity}</span>
              )}
              {childCount > 0 && (
                <span className="text-[10px] font-medium text-gray-500 flex-shrink-0">
                  {childCount} item{childCount !== 1 ? "s" : ""}
                </span>
              )}
              {asset.tracking_id && (
                <span title={`Tracking: ${asset.tracking_id}`} className="shrink-0">
                  <Radar className="h-3.5 w-3.5 text-primary" />
                </span>
              )}
              {(asset.original_parent_id || asset.is_borrowed) && (
                <BorrowedBadge
                  asset={asset}
                  className="px-2 py-0.5 text-[10px]"
                  onOpen={(id) => {
                    const kit = assets.find((a) => a.id === id);
                    if (kit) setDetailAsset(kit);
                    else navigate(`/assets?asset=${id}`);
                  }}
                />
              )}
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {asset.serial ? `SN: ${asset.serial}` : `ID: ${asset.id.slice(0, 8)}`}
              {operatorName && <span className="text-gray-400"> · {operatorName}</span>}
            </p>
          </div>

          {/* Status pill */}
          <span className={cn("rounded-full px-3 py-1 text-xs font-medium flex-shrink-0", pill.cls)}>
            {pill.label}
          </span>

          {/* Quick actions (visible on hover) */}
          <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); openEdit(asset); }}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCloneTarget(asset);
                setCloneName(`${asset.asset_name} (Copy)`);
                setCloneChildren(true);
              }}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Clone"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            {asset.parent_asset_id && (
              <button
                onClick={(e) => { e.stopPropagation(); void nestDnd.reparent(asset.id, null); }}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                title="Un-nest (move to top level)"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete "${asset.asset_name}" and all child assets? This cannot be undone.`)) {
                  deleteAssetMutation.mutate(asset.id, {
                    onSuccess: () => toast.success(`Deleted ${asset.asset_name}`),
                    onError: (err: any) => toast.error(`Delete failed: ${err.message}`),
                  });
                }
              }}
              className="p-2 rounded-lg hover:bg-red-500/15 text-gray-400 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {childCount > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleRow(asset.id); }}
              className={cn(
                "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all",
                isOpen ? "bg-blue-500/20 text-blue-300 rotate-90" : "bg-white/5 text-gray-400"
              )}
              title={isOpen ? "Collapse" : "Expand"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-600 flex-shrink-0 sm:hidden" />
          )}
        </div>

        {childCount > 0 && isOpen && (
          <div className="mt-0.5 mb-1">{kids.map((k) => renderAssetRow(k, depth + 1))}</div>
        )}
      </div>
    );
  }



  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6">
      <input
        ref={quickThumbInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleQuickThumbnailFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Asset Management</h1>
        <div className="flex items-center gap-2">
          {role === "manager" && (
            <Button variant="outline" className="gap-1.5 border-warning/40 text-warning hover:bg-warning/10" onClick={() => setManualCheckoutOpen(true)}>
              <ShieldAlert className="h-4 w-4" /> Manual Override
            </Button>
          )}
          <Button variant="outline" onClick={createDraftAsset} disabled={creatingDraft}>
            <Plus className="h-4 w-4 mr-1" /> {creatingDraft ? "Opening…" : "Quick Add"}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Gear
          </Button>
        </div>
      </div>

      {employee?.role === "admin" && (() => {
        const totalPortfolioValue = assets.reduce((sum, a) => sum + ((a.original_value ?? 0) * (a.quantity ?? 1)), 0);
        return (
          <div className="mb-4 flex items-center gap-3 rounded-lg border bg-card p-4">
            <DollarSign className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Portfolio Value</p>
              <p className="text-xl font-bold text-foreground">
                {totalPortfolioValue.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        );
      })()}

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <Button key={cat} size="sm" variant={filter === cat ? "default" : "outline"} onClick={() => setFilter(cat)} className="flex-shrink-0">
            {cat}
          </Button>
        ))}
      </div>

      {(() => {
        // Group top-level assets by category
        const grouped = new Map<string, typeof topLevelAssets>();
        for (const a of topLevelAssets) {
          const key = a.category || "Uncategorized";
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(a);
        }
        const orderedCats = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

        const pillFor = (status: AssetStatus) => {
          if (status === "available" || status === "in_transit") {
            return { label: status === "in_transit" ? "In Transit" : "Available", cls: "bg-green-500/10 text-green-400" };
          }
          if (status === "checked_out") {
            return { label: "Deployed", cls: "bg-blue-500/10 text-blue-400" };
          }
          return {
            label: status === "iffy" ? "Iffy" : status === "missing" ? "Missing" : "Broken",
            cls: "bg-red-500/10 text-red-400",
          };
        };

        return (
          <div className="rounded-2xl bg-[#121214] dark:bg-[#121214] p-2 sm:p-4">
            <p className="px-3 pb-2 text-[11px] text-gray-500">
              Tip: drag a row by its handle onto another item to nest it inside that kit.
            </p>
            {orderedCats.length === 0 && (
              <div className="px-4 py-16 text-center text-sm text-muted-foreground">
                No gear in this category yet.
              </div>
            )}
            {orderedCats.map((cat) => {
              const items = grouped.get(cat)!;
              return (
                <details key={cat} open className="group mb-4 last:mb-0">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 list-none [&::-webkit-details-marker]:hidden select-none">
                    <ChevronRight className="h-3.5 w-3.5 text-gray-500 transition-transform group-open:rotate-90" />
                    <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
                      {cat}
                    </span>
                    <span className="text-xs font-medium text-gray-600">· {items.length}</span>
                  </summary>
                  <div className="mt-1">
                    {items.map((asset) => renderAssetRow(asset, 0))}
                  </div>

                </details>
              );
            })}
          </div>
        );
      })()}

      {/* ─── Operator Gear Out Section ─── */}
      {(() => {
        // Build operator → checked-out parent assets map
        const operatorGearMap = new Map<string, { name: string; assets: Asset[] }>();
        assignments.forEach((a) => {
          if (!a.actual_start_time || a.actual_end_time) return;
          const op = employees.find((e) => e.id === a.operator_id);
          if (!op) return;
          const opEntry = operatorGearMap.get(a.operator_id) ?? { name: op.name ?? "Unknown", assets: [] };
          (a.asset_ids || []).forEach((aid) => {
            const asset = assets.find((x) => x.id === aid);
            if (asset && !asset.parent_asset_id) {
              if (!opEntry.assets.find((x) => x.id === aid)) opEntry.assets.push(asset);
            }
          });
          operatorGearMap.set(a.operator_id, opEntry);
        });

        const entries = Array.from(operatorGearMap.entries()).filter(([, v]) => v.assets.length > 0);
        if (entries.length === 0) return null;

        return (
          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-bold text-foreground">🎒 Gear Currently Out by Operator</h2>
            <div className="space-y-4">
              {entries.map(([opId, { name, assets: opAssets }]) => (
                <div key={opId} className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {(name || "?")[0]?.toUpperCase()}
                    </div>
                    {name}
                    <Badge variant="secondary" className="text-[10px]">{opAssets.length} rig{opAssets.length !== 1 ? "s" : ""}</Badge>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {opAssets.map((asset) => (
                      <Card
                        key={asset.id}
                        className="p-2 cursor-pointer hover:ring-1 hover:ring-primary/20 transition-shadow"
                        onClick={() => setDetailAsset(asset)}
                      >
                        <div className="flex gap-1.5">
                          <div className="w-1 rounded-full flex-shrink-0" style={{ backgroundColor: asset.color_code }} />
                          <div className="flex-1 min-w-0">
                            <div className="w-full h-16 rounded bg-muted flex items-center justify-center mb-1.5 overflow-hidden">
                              {asset.cover_image_url ? (
                                <AssetPhoto src={asset.cover_image_url} alt={asset.asset_name} className="w-full h-full object-cover" />
                              ) : coverUrls[asset.id] ? (
                                <AssetPhoto src={coverUrls[asset.id]} alt={asset.asset_name} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <p className="text-xs font-medium text-foreground truncate">{asset.asset_name}</p>
                            <span className="text-[10px] text-muted-foreground">{asset.category}</span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <AddAssetDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <AdminManualCheckoutDialog open={manualCheckoutOpen} onOpenChange={setManualCheckoutOpen} />

      {/* Asset Detail Sheet */}
      <Sheet open={!!detailAsset} onOpenChange={(open) => !open && setDetailAsset(null)}>
        <SheetContent className="sm:max-w-[440px] overflow-y-auto">
          {detailAsset && (
            <div className="space-y-6 pt-2">
              <SheetHeader>
                <SheetTitle className="text-xl">
                  {detailAsset.asset_name}
                  {(detailAsset.original_parent_id || detailAsset.is_borrowed) && (
                    <BorrowedBadge
                      asset={detailAsset}
                      className="ml-2 px-2 py-0 text-[10px] align-middle"
                      onOpen={(id) => {
                        const kit = assets.find((a) => a.id === id);
                        if (kit) setDetailAsset(kit);
                        else navigate(`/assets?asset=${id}`);
                      }}
                    />
                  )}
                </SheetTitle>
              </SheetHeader>
              {role === "manager" && (
                <div className="flex flex-col sm:flex-row gap-2">
                  {(detailAsset.original_parent_id || detailAsset.is_borrowed || detailAsset.home_parent_id) && (
                    <Button className="h-11 flex-1 rounded-full gap-1.5 bg-amber-500/90 hover:bg-amber-500 text-black" onClick={() => void handleReturnToHome(detailAsset)}>
                      <Undo2 className="h-4 w-4" /> Return to Original Kit
                    </Button>
                  )}
                  <Button variant="outline" className="h-11 flex-1 rounded-full gap-1.5 bg-foreground/5 backdrop-blur" onClick={() => setLendOpen(true)}>
                    <ArrowRightLeft className="h-4 w-4" /> Lend to Another Kit
                  </Button>
                </div>
              )}
              <LendToKitDialog
                open={lendOpen}
                onOpenChange={setLendOpen}
                asset={detailAsset}
                allAssets={assets}
                onLent={(kitId) => setDetailAsset((cur) => cur ? { ...cur, parent_asset_id: kitId, original_parent_id: cur.original_parent_id ?? cur.parent_asset_id ?? null, is_borrowed: true } : cur)}
              />
              {/* Flagged Items — surfaces this asset and its children that need attention */}
              {(() => {
                const flagged: { id: string; name: string; status: string; route: string }[] = [];
                const flag = (a: Asset) => {
                  const s = a.status;
                  if (s === "missing" || s === "broken" || s === "iffy") {
                    flagged.push({
                      id: a.id,
                      name: a.asset_name ?? "Unnamed",
                      status: s,
                      route: s === "missing" ? "/missing" : "/broken",
                    });
                  }
                };
                flag(detailAsset);
                (childrenMap.get(detailAsset.id) ?? []).forEach(flag);
                // Shrinkage log entries tied to this parent (or to this asset if it IS a parent)
                const parentId = detailAsset.parent_asset_id ?? detailAsset.id;
                const shrink = lostItems.filter(
                  (i) => i.parent_asset_id === parentId && i.condition !== "good"
                );
                if (flagged.length === 0 && shrink.length === 0) return null;
                return (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-warning flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> Flagged Items ({flagged.length + shrink.length})
                    </p>
                    <div className="space-y-1.5">
                      {flagged.map((f) => (
                        <button
                          key={`a-${f.id}`}
                          type="button"
                          onClick={() => navigate(f.route)}
                          className="w-full flex items-center justify-between gap-2 rounded-md bg-card/60 hover:bg-card/90 border border-border/40 px-2.5 py-1.5 text-left transition-colors"
                        >
                          <span className="text-xs font-medium text-foreground truncate">{f.name}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] shrink-0",
                              f.status === "missing" && "border-destructive/40 text-destructive",
                              f.status === "broken" && "border-destructive/40 text-destructive",
                              f.status === "iffy" && "border-warning/40 text-warning",
                            )}
                          >
                            {statusLabel(f.status as AssetStatus)}
                          </Badge>
                        </button>
                      ))}
                      {shrink.map((s) => (
                        <button
                          key={`s-${s.id}`}
                          type="button"
                          onClick={() => navigate(s.condition === "missing" ? "/missing" : "/broken")}
                          className="w-full flex items-center justify-between gap-2 rounded-md bg-card/60 hover:bg-card/90 border border-border/40 px-2.5 py-1.5 text-left transition-colors"
                        >
                          <span className="text-xs font-medium text-foreground truncate">
                            {s.item_name} <span className="text-muted-foreground">×{s.missing_quantity}</span>
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] shrink-0",
                              s.condition === "missing" && "border-destructive/40 text-destructive",
                              s.condition !== "missing" && "border-warning/40 text-warning",
                            )}
                          >
                            {s.condition}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {/* Cover Image */}
              {detailAsset.cover_image_url ? (
                <div className="w-full h-40 rounded-lg overflow-hidden">
                  <AssetPhoto src={detailAsset.cover_image_url} alt={detailAsset.asset_name} className="w-full h-full object-cover" />
                </div>
              ) : coverUrls[detailAsset.id] ? (
                <div className="w-full h-40 rounded-lg overflow-hidden">
                  <AssetPhoto src={coverUrls[detailAsset.id]} alt={detailAsset.asset_name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-full h-40 rounded-lg bg-muted flex items-center justify-center">
                  <Package className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              {/* Gallery */}
              {detailAsset.gallery_urls && detailAsset.gallery_urls.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {detailAsset.gallery_urls.map((url, i) => (
                    <AssetPhoto key={i} src={url} alt={`Gallery ${i + 1}`} className="h-16 w-16 rounded-md object-cover border border-border shrink-0" />
                  ))}
                </div>
              )}
              {/* Damage Photo */}
              {detailAsset.damage_photo_url && detailAsset.status === "broken" && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                  <p className="text-xs font-semibold text-destructive mb-1.5">⚠️ Damage Photo</p>
                  <AssetPhoto src={detailAsset.damage_photo_url} alt="Damage" className="w-full rounded-md max-h-40 object-cover" />
                </div>
              )}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {(() => {
                    const effectiveStatus = getEffectiveStatus(detailAsset);
                    return (
                      <Badge variant="secondary" className={cn(
                        effectiveStatus === "missing" && "bg-destructive/15 text-destructive",
                        effectiveStatus === "available" && "bg-success/15 text-success",
                        effectiveStatus !== "missing" && effectiveStatus !== "available" && "bg-primary/15 text-primary",
                      )}>
                        {statusLabel(effectiveStatus)}
                      </Badge>
                    );
                  })()}
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: detailAsset.color_code }} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="text-sm font-medium text-foreground">{detailAsset.category}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Serial Number</p>
                    <p className="text-sm font-medium text-foreground">{detailAsset.serial ?? "—"}</p>
                  </div>
                </div>

                {/* Tracking Device */}
                {detailAsset.tracking_id && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
                    <Radar className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Tracking Device</p>
                      <p className="text-sm font-medium text-foreground truncate">{detailAsset.tracking_id}</p>
                    </div>
                  </div>
                )}

                {/* Total Kit Value */}
                {detailTotalValue != null && detailTotalValue > 0 && (
                  <div className="flex items-center justify-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-green-400/20 bg-white/10 px-4 py-2 shadow-[0_0_20px_rgba(74,222,128,0.15)] backdrop-blur-sm">
                      <DollarSign className="h-4 w-4 text-green-400 shrink-0" />
                      <span className="text-sm font-medium text-green-300/80">Total Kit Value:</span>
                      <span className="text-base font-bold text-green-400">
                        ${detailTotalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {/* Child Components */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                      {detailAsset.category === "Computer Kit" ? "Computers" : "Child Components"}
                    </p>
                    {detailAsset.parent_asset_id && (
                      <Badge variant="outline" className="text-[9px] gap-1">🧩 Sub-item of a kit</Badge>
                    )}
                  </div>
                  {detailChildren.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      No child components yet. Tap <span className="font-semibold">Edit</span> to add children, then expand any child to add 🧩 sub-items (like the knob that ships with your scrollers).
                    </p>
                  )}
                  {detailChildren.map((child) => {
                    const recentlyReplaced = child.replaced_at && differenceInDays(new Date(), new Date(child.replaced_at)) <= 30;
                    const spec = child.metadata as ComputerSpec | undefined;
                    const isComputer = detailAsset.category === "Computer Kit" && spec;
                    const isAdmin = employee?.role === "admin";
                    const LATEST_OS = "macOS 16.3";
                    const needsUpdate = isComputer && spec?.os_version && spec.os_version !== LATEST_OS;
                    const borrowedFromId = child.original_parent_id ?? child.home_parent_id;
                    const isBorrowed = child.is_borrowed || (!!borrowedFromId && borrowedFromId !== detailAsset.id);
                    const homeKitName = isBorrowed ? (borrowedFromId ? (assets.find(a => a.id === borrowedFromId)?.asset_name ?? "Unknown Kit") : "Top Level") : "";

                    return (
                      <div
                        key={child.id}
                        className={cn(
                          "rounded-lg px-3 py-3 cursor-pointer hover:bg-muted/80 transition-colors space-y-2",
                          recentlyReplaced ? "bg-warning/10 border border-warning/30" : isBorrowed ? "bg-accent/30 border border-accent/50" : "bg-muted/50"
                        )}
                        onClick={() => setDetailAsset(child)}
                      >
                        <div className="flex items-center gap-2">
                          {isComputer ? <Laptop className="h-4 w-4 text-primary shrink-0" /> : <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: child.color_code }} />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{isComputer ? getAssetDisplayName(child) : child.asset_name}</p>
                            {child.serial && (
                              <p className="text-xs text-muted-foreground">S/N {child.serial}</p>
                            )}
                            {!isComputer && (
                              <p className="text-xs text-muted-foreground">
                                Qty: {child.quantity ?? 1}
                                {child.original_value ? ` · $${child.original_value.toFixed(2)}` : ""}
                                {(() => {
                                  const grandKids = childrenMap.get(child.id) ?? [];
                                  return grandKids.length > 0 ? ` · 🧩 ${grandKids.length} sub-item${grandKids.length === 1 ? "" : "s"}` : "";
                                })()}
                              </p>
                            )}
                          </div>
                          {isBorrowed && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "bg-accent/20 text-accent-foreground border-accent/40 text-[9px]",
                                borrowedFromId && "cursor-pointer transition-all hover:bg-accent/35 hover:shadow-[0_0_14px_hsl(var(--accent)/0.4)]"
                              )}
                              title={borrowedFromId ? "Click to view original kit" : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!borrowedFromId) return;
                                const kit = assets.find((a) => a.id === borrowedFromId);
                                if (kit) setDetailAsset(kit);
                                else navigate(`/assets?asset=${borrowedFromId}`);
                              }}
                            >
                              ⚠️ Borrowed from {homeKitName}
                            </Badge>
                          )}
                          {needsUpdate && (
                            <Badge className="bg-warning/20 text-warning border-warning/30 text-[9px]" variant="outline">
                              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Update Required
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] shrink-0">{statusLabel(child.status)}</Badge>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>

                        {/* Borrowed: return button */}
                        {isBorrowed && (
                          <div className="ml-6">
                            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-accent/40" onClick={(e) => { e.stopPropagation(); handleReturnToHome(child); }}>
                              <RotateCcw className="h-3 w-3" /> Return to {homeKitName}
                            </Button>
                          </div>
                        )}

                        {/* Damage photo on broken items */}
                        {child.damage_photo_url && child.status === "broken" && (
                          <div className="ml-6">
                            <AssetPhoto src={child.damage_photo_url} alt="Damage" className="h-12 w-20 rounded object-cover border border-destructive/30" />
                          </div>
                        )}

                        {/* Computer spec details - visible to everyone */}
                        {isComputer && spec && (
                          <div className="ml-6 space-y-1.5">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                              {spec.macbook_type && <p className="text-muted-foreground">Model: <span className="text-foreground font-medium">{spec.macbook_type} {spec.year ?? ""}</span></p>}
                              {spec.login_name && <p className="text-muted-foreground">Login: <span className="text-foreground font-medium">{spec.login_name}</span></p>}
                              {child.serial && <p className="text-muted-foreground">Serial: <span className="font-mono text-foreground">{child.serial}</span></p>}
                              {spec.os_version && <p className="text-muted-foreground">OS: <span className="text-foreground font-medium">{spec.os_version}</span></p>}
                              {spec.last_os_update && <p className="text-muted-foreground">Last Update: <span className="text-foreground">{spec.last_os_update}</span></p>}
                              {spec.prompter_version && <p className="text-muted-foreground">Prompter: <span className="text-foreground font-medium">{spec.prompter_version}</span></p>}
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className="flex items-center gap-1">
                                {spec.ms_word_installed ? <CheckCircle2 className="h-3 w-3 text-success" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
                                MS Word
                              </span>
                              <span className="flex items-center gap-1">
                                {spec.remote_desktop_installed ? <CheckCircle2 className="h-3 w-3 text-success" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
                                Remote Desktop
                              </span>
                            </div>
                            {spec.desktop_background_url && (
                              <div className="mt-1">
                                <img src={spec.desktop_background_url} alt="Desktop BG" className="h-10 w-16 rounded object-cover border border-border" />
                              </div>
                            )}
                            {/* Admin-only financial data */}
                            {isAdmin && child.original_value != null && (
                              <p className="text-[10px] font-medium text-primary">
                                💰 Original Value: ${child.original_value.toFixed(2)}
                              </p>
                            )}
                          </div>
                        )}

                        {recentlyReplaced && isAdmin && (
                          <p className="text-[10px] mt-1 ml-5 font-medium text-warning">
                            🔄 Recently Replaced | Original: ${(child.original_value ?? 0).toFixed(2)} | Replaced For: ${(child.replacement_cost ?? 0).toFixed(2)}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Loaned Out Items (ghosted) */}
                  {loanedOutItems.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Loaned Out</p>
                      {loanedOutItems.map(item => {
                        const currentKitName = assets.find(a => a.id === item.parent_asset_id)?.asset_name ?? "Unknown Kit";
                        return (
                          <div key={item.id} className="rounded-lg px-3 py-2 bg-muted/20 border border-dashed border-muted-foreground/20 opacity-60">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.color_code }} />
                              <p className="text-sm text-muted-foreground truncate flex-1">{item.asset_name}</p>
                              <Badge className="bg-muted text-muted-foreground border-muted-foreground/20 text-[9px]" variant="outline">
                                ⚠️ Loaned to {currentKitName}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Borrow Button (parent assets only) */}
              {!detailAsset.parent_asset_id && role === "manager" && (
                <Button variant="outline" className="w-full gap-1.5 border-accent/40" onClick={() => setBorrowDialogParent({ id: detailAsset.id, name: detailAsset.asset_name })}>
                  <ArrowLeftRight className="h-4 w-4" /> Borrow Item from Another Kit
                </Button>
              )}
              <Button className="w-full" variant="outline" onClick={() => openEdit(detailAsset)}>
                <Pencil className="h-4 w-4 mr-1.5" /> Edit Asset
              </Button>
              {/* GPS handoff breadcrumbs (active or last assignment with this asset) */}
              {(() => {
                const parentId = detailAsset.parent_asset_id ?? detailAsset.id;
                const childIds = (childrenMap.get(parentId) ?? []).map(c => c.id);
                const relevantIds = new Set([parentId, ...childIds, detailAsset.id]);
                const candidate = [...assignments]
                  .filter(a => (a.asset_ids || []).some(id => relevantIds.has(id)))
                  .sort((a, b) => {
                    const at = a.actual_start_time ? new Date(a.actual_start_time).getTime() : 0;
                    const bt = b.actual_start_time ? new Date(b.actual_start_time).getTime() : 0;
                    return bt - at;
                  })[0];
                const checkoutUrl = (candidate as any)?.checkout_location_url;
                const checkinUrl = (candidate as any)?.checkin_location_url;
                if (!checkoutUrl && !checkinUrl) return null;
                return (
                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Handoff Location</p>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {checkoutUrl && (
                        <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          📍 View Handoff Map (checkout)
                        </a>
                      )}
                      {checkinUrl && (
                        <a href={checkinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          📍 View Handoff Map (check-in)
                        </a>
                      )}
                    </div>
                  </div>
                );
              })()}
              {role === "manager" && (
                <AssetHistoryTimeline assetId={detailAsset.id} />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Unified Edit Modal (Wizard Steps) ─── */}
      {(() => {
        const isEditComputerKit = editParentForm.category === "Computer Kit";
        // Computer Kit: 1=Parent Info, 2=Computers, 3=Additional Components, 4=Collection Photos
        // Other: 1=Parent Info, 2=Child Components, 3=Collection Photos
        const editTotalSteps = isEditComputerKit ? 4 : 3;
        const visibleChildren = editChildren.filter((c) => !c.isDeleted);
        const editStepLabel = () => {
          if (isEditComputerKit) {
            return ["Parent Info", "Computers", "Additional Components", "Collection Photos"][editStep - 1];
          }
          return ["Parent Info", "Child Components", "Collection Photos"][editStep - 1];
        };

        const handleEditComputerPhotoSelect = (childId: string, file: File) => {
          const preview = URL.createObjectURL(file);
          setEditComputerPhotos((prev) => ({ ...prev, [childId]: { file, preview } }));
        };

        const removeEditComputerPhoto = (childId: string) => {
          setEditComputerPhotos((prev) => {
            const existing = prev[childId];
            if (existing?.preview && existing.file) URL.revokeObjectURL(existing.preview);
            const next = { ...prev };
            delete next[childId];
            return next;
          });
        };

        const handleEditCollectionPhotoSelect = (index: number, file: File) => {
          const preview = URL.createObjectURL(file);
          setEditCollectionPhotos((prev) => prev.map((p, i) => i === index ? { ...p, file, preview } : p));
        };

        const removeEditCollectionPhoto = (index: number) => {
          setEditCollectionPhotos((prev) => prev.map((p, i) => {
            if (i === index) {
              if (p.preview && p.file) URL.revokeObjectURL(p.preview);
              return { ...p, file: null, preview: null, existingUrl: undefined };
            }
            return p;
          }));
        };

        // Determine which children are "computers" vs "components" for Computer Kit edit
        const computerChildren = isEditComputerKit
          ? visibleChildren.filter((c) => c.metadata && Object.keys(c.metadata).length > 0 || c.serial)
          : [];
        const componentChildren = isEditComputerKit
          ? visibleChildren.filter((c) => !(c.metadata && Object.keys(c.metadata).length > 0 || c.serial))
          : visibleChildren;

        return (
          <Dialog open={!!editParent} onOpenChange={(open) => { if (!open) void closeEdit(); }}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-8">
                  <Pencil className="h-4 w-4 text-primary" />
                  <span className="truncate">Edit {editParentForm.asset_name || "Asset"} — {editStepLabel()}</span>
                  {/* Autosave status pill */}
                  <span
                    className={cn(
                      "ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition-all duration-300",
                      saveStatus === "saving"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : saveStatus === "saved"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-border/50 bg-foreground/5 text-muted-foreground"
                    )}
                  >
                    {saveStatus === "saving" ? (
                      <>
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Saving…
                      </>
                    ) : saveStatus === "saved" ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Saved
                      </>
                    ) : (
                      <>Autosave on</>
                    )}
                  </span>
                </DialogTitle>
                <div className="flex gap-1 mt-2">
                  {Array.from({ length: editTotalSteps }, (_, i) => i + 1).map((s) => (
                    <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= editStep ? "bg-primary" : "bg-muted"}`} />
                  ))}
                </div>
              </DialogHeader>

              {editParent && (
                <div className="py-2 min-h-[220px]">
                  {(editParent.original_parent_id || editParent.home_parent_id || editParent.is_borrowed) && (
                    <section className="mb-5 rounded-2xl border border-warning/35 bg-warning/10 p-4 shadow-[0_0_28px_hsl(var(--warning)/0.12)]">
                      <div className="flex items-center gap-2 text-warning">
                        <AlertTriangle className="h-5 w-5" />
                        <h3 className="font-bold">Borrowed Status</h3>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">This item is temporarily nested in its current kit.</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Button variant="outline" className="rounded-full" onClick={() => void handleReturnToHome(editParent)}>Return to Original Home</Button>
                        <Button className="rounded-full" onClick={() => void handleMakePermanent(editParent)}>Make Permanent Here</Button>
                      </div>
                    </section>
                  )}
                  {/* Step 1: Parent Info */}
                  {editStep === 1 && (
                    <section className="space-y-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parent Asset</h3>
                      <div className="space-y-1.5">
                        <Label className="text-[16px] md:text-sm">Cover Photo</Label>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={editCoverPhotoRef}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (editCoverPhoto.preview && editCoverPhoto.file) URL.revokeObjectURL(editCoverPhoto.preview);
                              setEditCoverPhoto({ file, preview: URL.createObjectURL(file) });
                            }
                            e.target.value = "";
                          }}
                        />
                        {editCoverPhoto.preview ? (
                          <div className="relative aspect-video rounded-2xl border border-border overflow-hidden group">
                            {editCoverPhoto.file ? (
                              <img src={editCoverPhoto.preview} alt="Cover" className="w-full h-full object-cover" />
                            ) : (
                              <AssetPhoto src={editCoverPhoto.preview} alt="Cover" className="w-full h-full object-cover" />
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <Button size="sm" variant="secondary" onClick={() => editCoverPhotoRef.current?.click()}>
                                <Camera className="h-4 w-4 mr-1.5" />Replace
                              </Button>
                              <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => {
                                if (editCoverPhoto.preview && editCoverPhoto.file) URL.revokeObjectURL(editCoverPhoto.preview);
                                setEditCoverPhoto({ file: null, preview: null });
                              }}><X className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="aspect-video rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer"
                            onClick={() => editCoverPhotoRef.current?.click()}
                          >
                            <Camera className="h-6 w-6" />
                            <span className="text-xs">Tap to add cover photo</span>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[16px] md:text-sm">Name</Label>
                          <Input className="text-[16px] md:text-sm" value={editParentForm.asset_name ?? ""} onChange={(e) => setEditParentForm((f) => ({ ...f, asset_name: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[16px] md:text-sm">Serial</Label>
                          <Input className="text-[16px] md:text-sm" value={editParentForm.serial ?? ""} onChange={(e) => setEditParentForm((f) => ({ ...f, serial: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[16px] md:text-sm">Category</Label>
                          <Select value={editParentForm.category ?? ""} onValueChange={(v) => setEditParentForm((f) => ({ ...f, category: v }))}>
                            <SelectTrigger className="text-[16px] md:text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>{CATEGORIES.filter((c) => c !== "All").map((cat) => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[16px] md:text-sm">Color</Label>
                          <Input type="color" className="h-10 w-20" value={editParentForm.color_code ?? "#3b82f6"} onChange={(e) => setEditParentForm((f) => ({ ...f, color_code: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          {editTotalValue != null && editTotalValue > 0 && (
                            <div className="flex items-center justify-center">
                              <div className="inline-flex items-center gap-2 rounded-full border border-green-400/20 bg-white/10 px-4 py-2 shadow-[0_0_20px_rgba(74,222,128,0.15)] backdrop-blur-sm">
                                <DollarSign className="h-4 w-4 text-green-400 shrink-0" />
                                <span className="text-sm font-medium text-green-300/80">Total Kit Value:</span>
                                <span className="text-base font-bold text-green-400">
                                  ${editTotalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          )}
                          <Label className="text-[16px] md:text-sm">Individual Item Value ($)</Label>
                          <Input type="number" min={0} step={0.01} className="text-[16px] md:text-sm" value={editParentForm.original_value ?? ""} onChange={(e) => { const v = parseFloat(e.target.value); setEditParentForm((f) => ({ ...f, original_value: isNaN(v) ? undefined : v })); }} placeholder="0.00" />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                          <Label className="text-[16px] md:text-sm flex items-center gap-1.5">
                            <Radar className="h-3.5 w-3.5 text-primary" />
                            Tracking Device
                          </Label>
                          <Input className="text-[16px] md:text-sm" value={editParentForm.tracking_id ?? ""} onChange={(e) => setEditParentForm((f) => ({ ...f, tracking_id: e.target.value }))} placeholder="e.g. AirTag: 🎥 Prompter Case A" />
                        </div>
                      </div>

                      {/* Admin-only purchase receipt */}
                      {role === "manager" && (
                        <div className="space-y-1.5 rounded-2xl border border-warning/30 bg-warning/5 p-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-[16px] md:text-sm flex items-center gap-1.5">
                              <ShieldAlert className="h-3.5 w-3.5 text-warning" />
                              Purchase Receipt <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">Admin only</span>
                            </Label>
                            {(editReceipt.file || (editReceipt.existingUrl && !editReceipt.cleared)) && (
                              <button
                                type="button"
                                onClick={() => setEditReceipt((r) => ({ ...r, file: null, cleared: true }))}
                                className="text-xs text-destructive hover:underline"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <input
                            ref={editReceiptRef}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setEditReceipt((r) => ({ ...r, file: f, cleared: false }));
                              e.target.value = "";
                            }}
                          />
                          {editReceipt.file ? (
                            <div className="text-xs text-muted-foreground truncate">📎 {editReceipt.file.name} (will upload on save)</div>
                          ) : editReceipt.existingUrl && !editReceipt.cleared ? (
                            <a
                              href={editReceipt.existingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline truncate block"
                              onClick={async (e) => {
                                // For private buckets, generate a signed URL on-the-fly
                                e.preventDefault();
                                const url = editReceipt.existingUrl!;
                                const marker = "/purchase-receipts/";
                                const idx = url.indexOf(marker);
                                if (idx >= 0) {
                                  const path = url.substring(idx + marker.length).split("?")[0];
                                  const { data } = await supabase.storage.from("purchase-receipts").createSignedUrl(path, 60);
                                  if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                                } else {
                                  window.open(url, "_blank");
                                }
                              }}
                            >
                              📎 View current receipt
                            </a>
                          ) : (
                            <div className="text-xs text-muted-foreground">No receipt uploaded</div>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 text-xs w-full"
                            onClick={() => editReceiptRef.current?.click()}
                          >
                            <Camera className="h-3.5 w-3.5 mr-1.5" /> {editReceipt.file || (editReceipt.existingUrl && !editReceipt.cleared) ? "Replace receipt" : "Upload receipt (PDF/Image)"}
                          </Button>
                          <Textarea
                            className="text-[16px] md:text-sm min-h-[60px] mt-2"
                            placeholder="Optional notes (vendor, PO #, etc.)"
                            value={editReceipt.notes}
                            onChange={(e) => setEditReceipt((r) => ({ ...r, notes: e.target.value }))}
                          />
                        </div>
                      )}
                      {editParentForm.damage_notes && (
                        <div className="space-y-1.5">
                          <Label className="text-[16px] md:text-sm">Damage Notes</Label>
                          <Textarea className="text-[16px] md:text-sm min-h-[60px]" value={editParentForm.damage_notes ?? ""} onChange={(e) => setEditParentForm((f) => ({ ...f, damage_notes: e.target.value }))} />
                        </div>
                      )}
                    </section>
                  )}

                  {/* Step 2 for Computer Kit: Computers */}
                  {editStep === 2 && isEditComputerKit && (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Computers ({computerChildren.length})</h3>
                        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => {
                          setEditChildren((prev) => [{
                            id: `new-${Date.now()}-${Math.random()}`,
                            asset_name: `Computer ${computerChildren.length + 1}`,
                            quantity: 1,
                            status: "available" as AssetStatus,
                            color_code: editParentForm.color_code ?? "#ec4899",
                            damage_notes: "",
                            original_value: null,
                            serial: "",
                            metadata: {},
                            isNew: true,
                          }, ...prev]);
                        }}>
                          <Plus className="h-3 w-3" /> Add Computer
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {editChildren.map((child, idx) => {
                          if (child.isDeleted) return null;
                          // Only show computers in this step
                          const isComputer = child.metadata && Object.keys(child.metadata).length > 0 || child.serial || child.isNew;
                          // For existing non-computer children, skip (show in step 3)
                          if (!child.isNew && !isComputer && !child.serial) return null;

                          return (
                            <div key={child.id} className={cn(
                              "rounded-lg border p-3 space-y-3",
                              (() => {
                                const origAsset = assets.find(a => a.id === child.id);
                                return origAsset?.replaced_at && differenceInDays(new Date(), new Date(origAsset.replaced_at)) <= 30
                                  ? "border-warning/40 bg-warning/5" : "border-border/60 bg-muted/30";
                              })()
                            )}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Laptop className="h-4 w-4 text-primary" />
                                  <span className="text-xs font-semibold text-foreground">{child.asset_name || "New Computer"}</span>
                                </div>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => markChildDeleted(idx)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Name</Label>
                                  <Input className="text-[16px] md:text-sm h-8" value={child.asset_name} onChange={(e) => updateChildRow(idx, { asset_name: e.target.value })} placeholder="e.g. MacBook 01" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Serial Number</Label>
                                  <Input className="text-[16px] md:text-sm h-8" value={child.serial} onChange={(e) => updateChildRow(idx, { serial: e.target.value })} placeholder="SN-..." />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Value ($)</Label>
                                  <Input type="number" min={0} step={0.01} className="text-[16px] md:text-sm h-8" value={child.original_value ?? ""} onChange={(e) => { const v = parseFloat(e.target.value); updateChildRow(idx, { original_value: isNaN(v) ? null : v }); }} placeholder="0.00" />
                                </div>
                              </div>
                              <ComputerSpecFields spec={child.metadata || {}} onChange={(spec) => updateChildRow(idx, { metadata: spec })} compact />
                              {/* Per-computer photo */}
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Photo</Label>
                                <input type="file" accept="image/*" className="hidden" ref={(el) => { editComputerPhotoRefs.current[child.id] = el; }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleEditComputerPhotoSelect(child.id, file); e.target.value = ""; }} />
                                {editComputerPhotos[child.id]?.preview ? (
                                  <div className="relative w-20 h-20 rounded-md border border-border overflow-hidden group">
                                    {editComputerPhotos[child.id].file ? (
                                      <img src={editComputerPhotos[child.id].preview!} alt={child.asset_name} className="w-full h-full object-cover" />
                                    ) : (
                                      <AssetPhoto src={editComputerPhotos[child.id].preview} alt={child.asset_name} className="w-full h-full object-cover" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <Button size="icon" variant="destructive" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); removeEditComputerPhoto(child.id); }}><X className="h-3 w-3" /></Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-20 h-20 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer" onClick={() => editComputerPhotoRefs.current[child.id]?.click()}>
                                    <Camera className="h-4 w-4" /><span className="text-[10px]">Add</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Step 2 for non-Computer Kit OR Step 3 for Computer Kit: Child Components */}
                  {((editStep === 2 && !isEditComputerKit) || (editStep === 3 && isEditComputerKit)) && (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {isEditComputerKit ? "Additional Components" : "Child Components"} ({componentChildren.length})
                        </h3>
                        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={addChildRow}>
                          <Plus className="h-3 w-3" /> Add Child
                        </Button>
                      </div>
                      {componentChildren.length === 0 && (
                        <p className="text-sm text-muted-foreground py-2">No components. Click "Add Child" to create one.</p>
                      )}
                      <div className="space-y-3">
                        {editChildren.map((child, idx) => {
                          if (child.isDeleted) return null;
                          // For Computer Kit, skip computers (shown in step 2)
                          if (isEditComputerKit && (child.metadata && Object.keys(child.metadata).length > 0 || child.serial)) return null;

                          return (
                            <div key={child.id} className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: child.color_code }} />
                                  <span className="text-xs font-semibold text-foreground">{child.asset_name || "New Child"}</span>
                                </div>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => markChildDeleted(idx)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Name</Label>
                                  <Input className="text-[16px] md:text-sm h-8" value={child.asset_name} onChange={(e) => updateChildRow(idx, { asset_name: e.target.value })} placeholder="e.g. HDMI Cable" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Quantity</Label>
                                  <Input type="number" min={1} className="text-[16px] md:text-sm h-8" value={child.quantity} onChange={(e) => updateChildRow(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Value ($)</Label>
                                  <Input type="number" min={0} step={0.01} className="text-[16px] md:text-sm h-8" value={child.original_value ?? ""} onChange={(e) => { const v = parseFloat(e.target.value); updateChildRow(idx, { original_value: isNaN(v) ? null : v }); }} placeholder="0.00" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Serial Number (Optional)</Label>
                                  <Input className="text-[16px] md:text-sm h-8" value={child.serial} onChange={(e) => updateChildRow(idx, { serial: e.target.value })} placeholder="SN-..." />
                                </div>
                              </div>

                              {/* ─── Sub-items (grandchildren) — adapters' mini accessories, etc. ─── */}
                              {(() => {
                                 const grands = (grandchildrenByChild[child.id] ?? []).filter((g) => !g.isDeleted);
                                 return (
                                   <div className="rounded-md border border-dashed border-border/60 bg-background/40 p-2 space-y-2">
                                     <div className="flex items-center justify-between">
                                       <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                         Sub-items ({grands.length})
                                       </span>
                                       <Button
                                         size="sm"
                                         variant="ghost"
                                         className="h-6 gap-1 text-xs px-2"
                                         title="Add a sub-item attached to this child"
                                         onClick={() => void addGrandchild(child.id)}
                                       >
                                         <Plus className="h-3 w-3" /> Add Sub-item
                                       </Button>
                                     </div>
                                     {grands.length === 0 && (
                                      <p className="text-[11px] text-muted-foreground italic">
                                        e.g. tiny adapters, caps, or accessories that live on this item.
                                      </p>
                                    )}
                                    {(grandchildrenByChild[child.id] ?? []).map((g, gIdx) => {
                                      if (g.isDeleted) return null;
                                      return (
                                         <div key={g.id} className="grid grid-cols-[1fr_70px_60px_80px_28px] gap-1.5 items-end">
                                           <Input
                                             className="text-[16px] md:text-xs h-7"
                                             placeholder="Sub-item name"
                                             value={g.asset_name}
                                             onChange={(e) => updateGrandchild(child.id, gIdx, { asset_name: e.target.value })}
                                           />
                                           <Input
                                             className="text-[16px] md:text-xs h-7"
                                             placeholder="S/N (optional)"
                                             title="Serial Number (Optional)"
                                             value={g.serial}
                                             onChange={(e) => updateGrandchild(child.id, gIdx, { serial: e.target.value })}
                                           />
                                           <Input
                                             type="number"
                                             min={1}
                                             className="text-[16px] md:text-xs h-7"
                                             value={g.quantity}
                                             onChange={(e) => updateGrandchild(child.id, gIdx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                           />
                                           <Input
                                             type="number"
                                             min={0}
                                             step={0.01}
                                             className="text-[16px] md:text-xs h-7"
                                             placeholder="$"
                                             value={g.original_value ?? ""}
                                             onChange={(e) => { const v = parseFloat(e.target.value); updateGrandchild(child.id, gIdx, { original_value: isNaN(v) ? null : v }); }}
                                           />
                                           <Button
                                             size="icon"
                                             variant="ghost"
                                             className="h-7 w-7 text-destructive"
                                             onClick={() => markGrandchildDeleted(child.id, gIdx)}
                                           >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Last Step: Collection Photos */}
                  {((editStep === 3 && !isEditComputerKit) || (editStep === 4 && isEditComputerKit)) && (
                    <section className="space-y-3">
                      <p className="text-sm text-muted-foreground">Upload or replace photos for the entire {isEditComputerKit ? "Computer Kit collection" : "asset"}.</p>
                      <div className="grid grid-cols-2 gap-3">
                        {editCollectionPhotos.map((photo, index) => (
                          <div key={photo.label} className="relative">
                            <input type="file" accept="image/*" className="hidden" ref={(el) => { editCollectionPhotoRefs.current[index] = el; }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleEditCollectionPhotoSelect(index, file); e.target.value = ""; }} />
                            {photo.preview ? (
                              <div className="aspect-square rounded-lg border border-border overflow-hidden relative group">
                                {photo.file ? (
                                  <img src={photo.preview} alt={photo.label} className="w-full h-full object-cover" />
                                ) : (
                                  <AssetPhoto src={photo.preview} alt={photo.label} className="w-full h-full object-cover" />
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Button size="icon" variant="destructive" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); removeEditCollectionPhoto(index); }}><X className="h-4 w-4" /></Button>
                                </div>
                                <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">{photo.label}</span>
                              </div>
                            ) : (
                              <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer" onClick={() => editCollectionPhotoRefs.current[index]?.click()}>
                                <Camera className="h-5 w-5" /><span className="text-xs">{photo.label}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="destructive" onClick={handleDeleteParent} disabled={isSaving || isDeleting}>
                  <Trash2 className="h-4 w-4 mr-1.5" />{isDeleting ? "Deleting…" : "Delete"}
                </Button>
                <div className="flex-1" />
                {editStep > 1 && <Button variant="outline" onClick={() => setEditStep((s) => s - 1)} disabled={isSaving}>Back</Button>}
                {editStep < editTotalSteps ? (
                  <Button onClick={() => setEditStep((s) => s + 1)}>Next</Button>
                ) : (
                  <Button onClick={async () => {
                    setSaveStatus("saving");
                    touchedRef.current = true;
                    await handleSaveAll({ silent: true });
                    baselineRef.current = formSnapshot;
                    // Upload any pending cover / collection / computer photos
                    await flushPendingPhotos(editParent);
                    if (editParent) {
                      // Admin-only purchase receipt (file + notes)
                      if (role === "manager") {
                        const updates: Record<string, any> = {};
                        if (editReceipt.file) {
                          const ext = editReceipt.file.name.split(".").pop() || "pdf";
                          const path = `${editParent.id}/receipt.${ext}`;
                          const { error: upErr } = await supabase.storage.from("purchase-receipts").upload(path, editReceipt.file, { upsert: true });
                          if (upErr) {
                            toast.error(`Receipt upload failed: ${upErr.message}`);
                          } else {
                            const { data: urlData } = supabase.storage.from("purchase-receipts").getPublicUrl(path);
                            updates.purchase_receipt_url = urlData?.publicUrl ?? null;
                          }
                        } else if (editReceipt.cleared) {
                          updates.purchase_receipt_url = null;
                        }
                        // Always sync notes
                        updates.purchase_receipt_notes = editReceipt.notes?.trim() || null;
                        if (Object.keys(updates).length > 0) {
                          await supabase.from("assets").update(updates as any).eq("id", editParent.id);
                        }
                      }
                    }
                    qc.invalidateQueries({ queryKey: ["assets"] });
                    setSaveStatus("saved");
                    await closeEdit({ alreadyFlushed: true });
                  }} disabled={isSaving || isDeleting}>
                    {isSaving ? "Saving…" : "Done"}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
      {/* Clone Asset Dialog */}
      <Dialog open={!!cloneTarget} onOpenChange={(open) => !open && setCloneTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-primary" /> Clone Asset
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">New Name</Label>
              <Input
                className="text-[16px] md:text-sm"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="New asset name"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="clone-children"
                checked={cloneChildren}
                onCheckedChange={(v) => setCloneChildren(!!v)}
              />
              <Label htmlFor="clone-children" className="text-sm cursor-pointer">
                Include child components ({cloneTarget ? (childrenMap.get(cloneTarget.id) ?? []).length : 0})
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneTarget(null)}>Cancel</Button>
            <Button
              disabled={!cloneName.trim() || cloneAssetMutation.isPending}
              onClick={() => {
                if (!cloneTarget || !cloneName.trim()) return;
                cloneAssetMutation.mutate(
                  {
                    originalParentId: cloneTarget.id,
                    newName: cloneName.trim(),
                    includeChildren: cloneChildren,
                    allAssets: assets,
                  },
                  {
                    onSuccess: ({ childCount }) => {
                      toast.success(`✅ Cloned '${cloneTarget.asset_name}' → '${cloneName.trim()}' with ${childCount} child components.`);
                      setCloneTarget(null);
                    },
                  }
                );
              }}
            >
              {cloneAssetMutation.isPending ? "Cloning…" : "Clone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Damage Photo Dialog */}
      <DamagePhotoDialog
        open={!!damagePhotoTarget}
        onOpenChange={(v) => !v && setDamagePhotoTarget(null)}
        assetId={damagePhotoTarget?.id ?? ""}
        assetName={damagePhotoTarget?.name ?? ""}
        onComplete={() => {
          qc.invalidateQueries({ queryKey: ["assets"] });
          setDamagePhotoTarget(null);
        }}
      />

      {/* Borrow Item Dialog */}
      <BorrowItemDialog
        open={!!borrowDialogParent}
        onOpenChange={(v) => !v && setBorrowDialogParent(null)}
        currentKitId={borrowDialogParent?.id ?? ""}
        currentKitName={borrowDialogParent?.name ?? ""}
        allAssets={assets}
      />

      <AssetNestMoveDialog
        open={!!nestDnd.pendingMove}
        itemName={nestDnd.pendingMove ? nestDnd.getAsset(nestDnd.pendingMove.childId)?.asset_name ?? "This item" : "This item"}
        parentName={nestDnd.pendingMove ? nestDnd.getAsset(nestDnd.pendingMove.parentId)?.asset_name ?? "this kit" : "this kit"}
        pending={nestDnd.moving}
        onOpenChange={(open) => !open && nestDnd.cancelPendingMove()}
        onPermanent={() => void nestDnd.resolvePendingMove(false)}
        onBorrow={() => void nestDnd.resolvePendingMove(true)}
      />

      {/* ─── Cascade status dialog: when a parent is marked missing/broken,
              offer to apply the same status to every descendant. ─── */}
      <Dialog open={!!cascadeTarget} onOpenChange={(v) => !v && setCascadeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Mark sub-items as {cascadeTarget?.status}?
            </DialogTitle>
          </DialogHeader>
          {cascadeTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You marked <span className="font-semibold text-foreground">{cascadeTarget.asset.asset_name}</span> as{" "}
                <span className="font-semibold text-foreground">{cascadeTarget.status}</span>. There{" "}
                {cascadeTarget.descendants.length === 1 ? "is" : "are"}{" "}
                <span className="font-semibold text-foreground">{cascadeTarget.descendants.length}</span> item
                {cascadeTarget.descendants.length !== 1 ? "s" : ""} inside it (including any sub-items). Apply the same
                status to all of them?
              </p>
              <div className="rounded-md border border-border/60 bg-muted/30 p-2 max-h-40 overflow-y-auto space-y-1">
                {cascadeTarget.descendants.map((d) => (
                  <div key={d.id} className="text-xs text-foreground/80 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: d.color_code }} />
                    <span className="truncate">{d.asset_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCascadeTarget(null)}>
              Just the parent
            </Button>
            <Button
              variant="destructive"
              onClick={applyCascadeStatus}
              disabled={updateAssetStatusMutation.isPending}
            >
              Yes, mark all {cascadeTarget?.descendants.length ?? 0} as {cascadeTarget?.status}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
