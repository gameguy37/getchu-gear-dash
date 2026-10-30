import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Share2, Trash2, Pencil, RotateCcw, Scissors, User, QrCode, Box } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { MeemawQRDialog } from "@/components/MeemawQRDialog";

interface Kit {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  status: string;
  cover_image_url: string | null;
  case_count: number | null;
}
interface Member {
  id: string;
  kit_id: string;
  asset_id: string;
  position: number;
  shared_out: boolean;
  shared_at: string | null;
  shared_notes: string | null;
  shared_with_employee_id: string | null;
  shared_job_id: string | null;
}
interface Employee { id: string; name: string | null; role: string | null; status: string | null; }
interface JobLite { id: string; job_number: string | null; client_name: string | null; job_date: string | null; status: string; }
interface Asset {
  id: string;
  asset_name: string | null;
  category: string | null;
  status: string | null;
  parent_asset_id: string | null;
  cover_image_url: string | null;
}

export default function MeemawKits() {
  const qc = useQueryClient();
  const [editKit, setEditKit] = useState<Kit | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👵");
  const [description, setDescription] = useState("");
  const [caseCount, setCaseCount] = useState<number>(1);
  const [activeKit, setActiveKit] = useState<Kit | null>(null);
  const [qrKit, setQrKit] = useState<Kit | null>(null);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [pickedAssetIds, setPickedAssetIds] = useState<string[]>([]);
  const [shareMember, setShareMember] = useState<Member | null>(null);
  const [shareNotes, setShareNotes] = useState("");
  const [shareEmployeeId, setShareEmployeeId] = useState<string>("");
  const [shareJobId, setShareJobId] = useState<string>("none");
  const [splitKit, setSplitKit] = useState<Kit | null>(null);
  const [deleteKit, setDeleteKit] = useState<Kit | null>(null);

  const { data: kits = [] } = useQuery({
    queryKey: ["meemaw_kits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meemaw_kits" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Kit[]) ?? [];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["meemaw_kit_members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meemaw_kit_members" as any).select("*").order("position");
      if (error) throw error;
      return (data as unknown as Member[]) ?? [];
    },
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["assets_parents_for_meemaw"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("id,asset_name,category,status,parent_asset_id,cover_image_url")
        .is("parent_asset_id", null)
        .order("asset_name");
      if (error) throw error;
      return (data as Asset[]) ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["meemaw_share_employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,role,status")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data as Employee[]) ?? [];
    },
  });
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const { data: openJobs = [] } = useQuery({
    queryKey: ["meemaw_share_jobs", shareEmployeeId],
    enabled: !!shareEmployeeId,
    queryFn: async () => {
      // Pull the assignments for this employee, then their jobs (not completed/cancelled)
      const { data: asg, error: aerr } = await supabase
        .from("assignments")
        .select("job_id")
        .eq("operator_id", shareEmployeeId);
      if (aerr) throw aerr;
      const jobIds = Array.from(new Set((asg ?? []).map((a: any) => a.job_id).filter(Boolean)));
      if (jobIds.length === 0) return [] as JobLite[];
      const { data, error } = await supabase
        .from("jobs")
        .select("id,job_number,client_name,job_date,status")
        .in("id", jobIds)
        .not("status", "in", "(completed,cancelled)")
        .order("job_date", { ascending: true });
      if (error) throw error;
      return (data as JobLite[]) ?? [];
    },
  });

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const membersByKit = useMemo(() => {
    const m = new Map<string, Member[]>();
    members.forEach((mem) => {
      const arr = m.get(mem.kit_id) ?? [];
      arr.push(mem);
      m.set(mem.kit_id, arr);
    });
    return m;
  }, [members]);
  const memberAssetIds = useMemo(() => new Set(members.map((m) => m.asset_id)), [members]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["meemaw_kits"] });
    qc.invalidateQueries({ queryKey: ["meemaw_kit_members"] });
  };

  const resetForm = () => { setName(""); setEmoji("👵"); setDescription(""); setCaseCount(1); setEditKit(null); setCreating(false); };

  const saveKit = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    const payload = {
      name: name.trim(),
      emoji: emoji.trim() || "👵",
      description: description.trim() || null,
      case_count: Math.max(1, Math.floor(caseCount || 1)),
    };
    if (editKit) {
      const { error } = await supabase.from("meemaw_kits" as any).update(payload).eq("id", editKit.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Kit updated");
    } else {
      const { error } = await supabase.from("meemaw_kits" as any).insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Meemaw kit created");
    }
    resetForm();
    refresh();
  };

  const addMembers = async () => {
    if (!activeKit || pickedAssetIds.length === 0) return;
    const rows = pickedAssetIds.map((id, i) => ({ kit_id: activeKit.id, asset_id: id, position: (membersByKit.get(activeKit.id)?.length ?? 0) + i }));
    const { error } = await supabase.from("meemaw_kit_members" as any).insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${rows.length} to ${activeKit.name}`);
    setPickedAssetIds([]);
    setAddMembersOpen(false);
    refresh();
  };

  const removeMember = async (m: Member) => {
    const { error } = await supabase.from("meemaw_kit_members" as any).delete().eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed from kit");
    refresh();
  };

  const shareOut = async () => {
    if (!shareMember) return;
    if (!shareEmployeeId) { toast.error("Pick an operator to share with"); return; }
    const { error } = await supabase.from("meemaw_kit_members" as any).update({
      shared_out: true,
      shared_at: new Date().toISOString(),
      shared_notes: shareNotes.trim() || null,
      shared_with_employee_id: shareEmployeeId,
      shared_job_id: shareJobId !== "none" ? shareJobId : null,
    }).eq("id", shareMember.id);
    if (error) { toast.error(error.message); return; }
    const who = employeeById.get(shareEmployeeId)?.name ?? "operator";
    toast.success(`Shared out to ${who}`);
    setShareMember(null);
    setShareNotes("");
    setShareEmployeeId("");
    setShareJobId("none");
    refresh();
  };

  const returnHome = async (m: Member) => {
    const { error } = await supabase.from("meemaw_kit_members" as any).update({
      shared_out: false, shared_at: null, shared_notes: null,
      shared_with_employee_id: null, shared_job_id: null,
    }).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Returned to kit");
    refresh();
  };

  const splitConfirm = async () => {
    if (!splitKit) return;
    const { error: e1 } = await supabase.from("meemaw_kit_members" as any).delete().eq("kit_id", splitKit.id);
    if (e1) { toast.error(e1.message); return; }
    const { error: e2 } = await supabase.from("meemaw_kits" as any).delete().eq("id", splitKit.id);
    if (e2) { toast.error(e2.message); return; }
    toast.success(`${splitKit.name} split — components are free`);
    setSplitKit(null);
    refresh();
  };

  const deleteConfirm = async () => {
    if (!deleteKit) return;
    const { error } = await supabase.from("meemaw_kits" as any).delete().eq("id", deleteKit.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Kit deleted");
    setDeleteKit(null);
    refresh();
  };

  useEffect(() => {
    if (editKit) { setName(editKit.name); setEmoji(editKit.emoji ?? "👵"); setDescription(editKit.description ?? ""); setCaseCount(editKit.case_count ?? 1); }
  }, [editKit]);

  const availableAssetsForKit = assets.filter((a) => !memberAssetIds.has(a.id));

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <span className="text-3xl">👵</span> Meemaw Kits
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Bundle parent assets that stay together. Share components temporarily without breaking the kit.
          </p>
        </div>
        <Button onClick={() => { setCreating(true); }} className="h-12 rounded-xl">
          <Plus className="h-4 w-4 mr-2" /> New Meemaw
        </Button>
      </header>

      {kits.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground rounded-2xl">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-60" />
          No Meemaw kits yet. Create one to bundle parent assets together.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {kits.map((kit) => {
            const kMembers = membersByKit.get(kit.id) ?? [];
            const sharedCount = kMembers.filter((m) => m.shared_out).length;
            return (
              <Card key={kit.id} className="p-4 rounded-2xl border-[1.5px] space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl">{kit.emoji ?? "👵"}</span>
                    <div className="min-w-0">
                      <Link to={`/meemaw-kits/${kit.id}`} className="font-semibold truncate hover:underline block">{kit.name}</Link>
                      {kit.description && <p className="text-xs text-muted-foreground truncate">{kit.description}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setQrKit(kit)} title="QR code">
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditKit(kit)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setDeleteKit(kit)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <Badge variant="secondary" className="gap-1"><Box className="h-3 w-3" />{kit.case_count ?? 1} case{(kit.case_count ?? 1) === 1 ? "" : "s"}</Badge>
                  <Badge variant="secondary">{kMembers.length} members</Badge>
                  {sharedCount > 0 && <Badge variant="outline" className="text-amber-600 border-amber-600/40">{sharedCount} shared out</Badge>}
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {kMembers.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No components yet.</p>
                  )}
                  {kMembers.map((m) => {
                    const a = assetById.get(m.asset_id);
                    const borrower = m.shared_with_employee_id ? employeeById.get(m.shared_with_employee_id) : null;
                    return (
                      <div key={m.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg border ${m.shared_out ? "bg-amber-500/5 border-amber-500/30" : "bg-muted/30"}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{a?.asset_name ?? "Unknown asset"}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {a?.category ?? "—"}
                            {m.shared_out && (borrower ? ` · With ${borrower.name}` : " · Shared out")}
                            {m.shared_notes && ` · ${m.shared_notes}`}
                          </p>
                          {m.shared_out && borrower && (
                            <Badge variant="outline" className="mt-1 h-5 text-[10px] border-amber-500/40 text-amber-600 gap-1">
                              <User className="h-3 w-3" /> @{borrower.name}
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {m.shared_out ? (
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => returnHome(m)}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Return
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShareMember(m); setShareNotes(""); setShareEmployeeId(""); setShareJobId("none"); }}>
                              <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeMember(m)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 h-10 rounded-xl" onClick={() => { setActiveKit(kit); setPickedAssetIds([]); setAddMembersOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1" /> Add components
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 rounded-xl" onClick={() => setSplitKit(kit)}>
                    <Scissors className="h-4 w-4 mr-1" /> Split
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit kit */}
      <Dialog open={creating || !!editKit} onOpenChange={(o) => { if (!o) resetForm(); }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editKit ? "Edit Meemaw" : "New Meemaw Kit"}</DialogTitle>
            <DialogDescription>Kits keep parent assets bundled together until you split them or share a piece out.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="w-20">
                <Label className="text-xs">Emoji</Label>
                <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="text-center text-xl" />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ABC Studios A-Cam Kit" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Number of cases</Label>
              <Input
                type="number"
                min={1}
                value={caseCount}
                onChange={(e) => setCaseCount(parseInt(e.target.value || "1", 10))}
                placeholder="1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">How many physical cases ship with this kit.</p>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What stays in this kit?" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            <Button onClick={saveKit}>{editKit ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add members */}
      <Dialog open={addMembersOpen} onOpenChange={setAddMembersOpen}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle>Add components to {activeKit?.name}</DialogTitle>
            <DialogDescription>
              Each parent asset can belong to one kit at a time. Selected items stay together permanently until you remove them or split the kit.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {availableAssetsForKit.length === 0 && (
              <p className="text-sm text-muted-foreground italic p-2">No unassigned parent assets available.</p>
            )}
            {availableAssetsForKit.map((a) => (
              <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={pickedAssetIds.includes(a.id)}
                  onCheckedChange={(c) => {
                    setPickedAssetIds((prev) => c ? [...prev, a.id] : prev.filter((id) => id !== a.id));
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.asset_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.category ?? "—"} · {a.status ?? "—"}</p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddMembersOpen(false)}>Cancel</Button>
            <Button onClick={addMembers} disabled={pickedAssetIds.length === 0}>Add {pickedAssetIds.length || ""}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share member */}
      <Dialog open={!!shareMember} onOpenChange={(o) => { if (!o) setShareMember(null); }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Share component out</DialogTitle>
            <DialogDescription>
              Temporarily release this component from the kit. The kit definition stays intact — return it home when it's back.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Share with operator *</Label>
              <Select value={shareEmployeeId} onValueChange={(v) => { setShareEmployeeId(v); setShareJobId("none"); }}>
                <SelectTrigger><SelectValue placeholder="Pick an operator…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      @{e.name} {e.role ? <span className="text-muted-foreground text-xs">· {e.role}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Attach to a job (optional)</Label>
              <Select value={shareJobId} onValueChange={setShareJobId} disabled={!shareEmployeeId}>
                <SelectTrigger><SelectValue placeholder={shareEmployeeId ? "No job — just tag them" : "Pick an operator first"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No job — just tag them</SelectItem>
                  {openJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.client_name ?? j.job_number} {j.job_date ? `· ${format(new Date(j.job_date + "T00:00:00"), "MMM d")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={shareNotes} onChange={(e) => setShareNotes(e.target.value)} placeholder="Loaned to ABC Studios for the day…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShareMember(null)}>Cancel</Button>
            <Button onClick={shareOut}>Share out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split kit */}
      <AlertDialog open={!!splitKit} onOpenChange={(o) => { if (!o) setSplitKit(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Split {splitKit?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This breaks the kit apart. All components become free parent assets again. The kit itself will be deleted. The assets themselves are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={splitConfirm}>Split kit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete kit */}
      <AlertDialog open={!!deleteKit} onOpenChange={(o) => { if (!o) setDeleteKit(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteKit?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the Meemaw kit and frees its members. Underlying assets are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {qrKit && (
        <MeemawQRDialog
          open={!!qrKit}
          onClose={() => setQrKit(null)}
          kitId={qrKit.id}
          kitName={qrKit.name}
          emoji={qrKit.emoji}
          caseCount={qrKit.case_count ?? 1}
        />
      )}
    </div>
  );
}
