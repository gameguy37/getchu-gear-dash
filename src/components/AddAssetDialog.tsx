import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Camera, QrCode, X, Loader2, Laptop, Copy } from "lucide-react";
import { toast } from "sonner";
import { useCreateAsset } from "@/hooks/useSupabaseData";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { uploadAssetPhoto } from "@/lib/assetPhotos";
import { ComputerSpecFields } from "@/components/ComputerSpecFields";
import type { ComputerSpec } from "@/lib/types";
import { CloneChildAssetSheet, type ClonableChild } from "@/components/CloneChildAssetSheet";

const GEAR_TYPES: { label: string; color: string }[] = [
  { label: "Through The Lens", color: "#3b82f6" },
  { label: "Presidential", color: "#f59e0b" },
  { label: "Robotic Presidential", color: "#ef4444" },
  { label: "Computer Kit", color: "#ec4899" },
  { label: "Cable Bag", color: "#64748b" },
  { label: "Direct View Kit", color: "#06b6d4" },
  { label: "Big Monitor", color: "#8b5cf6" },
  { label: "Wedgeprompt (tm)", color: "#10b981" },
  { label: "DSM", color: "#f97316" },
  { label: "Tour Box", color: "#6366f1" },
  { label: "Above The Lens", color: "#14b8a6" },
  { label: "Wireless Rigs", color: "#a855f7" },
];

const CUSTOM_TYPE_COLORS = ["#f43f5e", "#84cc16", "#eab308", "#22d3ee", "#c084fc", "#fb923c"];

const CONDITIONS = ["Good", "Fair", "Iffy", "Bad", "Broken"];
const PHOTO_VIEWS = ["Front", "Side", "Back", "Detail"];

interface ComputerChild {
  name: string;
  serial: string;
  value: string;
  spec: ComputerSpec;
  photo: File | null;
  photoPreview: string | null;
}

interface PhotoSlot { label: string; file: File | null; preview: string | null; uploading: boolean; }

interface AddAssetDialogProps { open: boolean; onOpenChange: (open: boolean) => void; }

export function AddAssetDialog({ open, onOpenChange }: AddAssetDialogProps) {
  const createAsset = useCreateAsset();
  const [step, setStep] = useState(1);
  const [gearType, setGearType] = useState("");
  const [customTypes, setCustomTypes] = useState<{ label: string; color: string }[]>([]);
  const [addingNewType, setAddingNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const allGearTypes = [...GEAR_TYPES, ...customTypes];
  const addCustomType = () => {
    const label = newTypeName.trim();
    if (!label) return;
    if (allGearTypes.some((g) => g.label.toLowerCase() === label.toLowerCase())) {
      setGearType(allGearTypes.find((g) => g.label.toLowerCase() === label.toLowerCase())!.label);
    } else {
      const color = CUSTOM_TYPE_COLORS[customTypes.length % CUSTOM_TYPE_COLORS.length];
      setCustomTypes((prev) => [...prev, { label, color }]);
      setGearType(label);
    }
    setNewTypeName("");
    setAddingNewType(false);
  };
  const [assetName, setAssetName] = useState("");
  const [serial, setSerial] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [purchasedFrom, setPurchasedFrom] = useState("");
  const [originalValue, setOriginalValue] = useState("");
  const [purchaseDate, setPurchaseDate] = useState<Date>();
  const [condition, setCondition] = useState("Good");
  const [trackingId, setTrackingId] = useState("");
  // Generic child components (non Computer Kit)
  interface ChildComponent {
    name: string;
    brand: string;
    category: string;
    price: string;
    serial: string;
    condition: string;
    quantity: number;
    cable_length: string;
    notes: string;
    atem_version: string;
  }
  const blankChild = (): ChildComponent => ({
    name: "", brand: "", category: "", price: "", serial: "", condition: "Good", quantity: 1, cable_length: "",
    notes: "", atem_version: "",
  });
  const [components, setComponents] = useState<ChildComponent[]>([]);
  const [cloneSheetIdx, setCloneSheetIdx] = useState<number | null>(null);
  // Computer Kit children
  const [computers, setComputers] = useState<ComputerChild[]>([
    { name: "Computer 1", serial: "", value: "", spec: {}, photo: null, photoPreview: null },
    { name: "Computer 2", serial: "", value: "", spec: {}, photo: null, photoPreview: null },
  ]);
  const computerPhotoRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [photos, setPhotos] = useState<PhotoSlot[]>(
    PHOTO_VIEWS.map((label) => ({ label, file: null, preview: null, uploading: false }))
  );
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Cover & gallery photos
  const [coverPhoto, setCoverPhoto] = useState<{ file: File | null; preview: string | null }>({ file: null, preview: null });
  const coverPhotoRef = useRef<HTMLInputElement>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<{ file: File; preview: string }[]>([]);
  const galleryPhotoRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  const selectedColor = allGearTypes.find((g) => g.label === gearType)?.color || "#3b82f6";
  const isComputerKit = gearType === "Computer Kit";

  const reset = () => {
    setStep(1); setGearType(""); setAssetName(""); setSerial(""); setManufacturer("");
    setPurchasedFrom(""); setPurchaseDate(undefined); setCondition("Good"); setOriginalValue(""); setTrackingId("");
    setComponents([]);
    computers.forEach((c) => { if (c.photoPreview) URL.revokeObjectURL(c.photoPreview); });
    setComputers([
      { name: "Computer 1", serial: "", value: "", spec: {}, photo: null, photoPreview: null },
      { name: "Computer 2", serial: "", value: "", spec: {}, photo: null, photoPreview: null },
    ]);
    photos.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
    setPhotos(PHOTO_VIEWS.map((label) => ({ label, file: null, preview: null, uploading: false })));
    if (coverPhoto.preview) URL.revokeObjectURL(coverPhoto.preview);
    setCoverPhoto({ file: null, preview: null });
    galleryPhotos.forEach(g => URL.revokeObjectURL(g.preview));
    setGalleryPhotos([]);
  };

  const addComponent = () => { setComponents((prev) => [...prev, blankChild()]); };
  const updateComponent = (i: number, patch: Partial<ChildComponent>) => { setComponents((prev) => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c)); };
  const removeComponent = (i: number) => { setComponents((prev) => prev.filter((_, idx) => idx !== i)); };

  const handleCloneFill = (data: ClonableChild) => {
    if (cloneSheetIdx == null) return;
    // Safe clone: name, brand, category, price, cable_length only — NEVER serial.
    updateComponent(cloneSheetIdx, {
      name: data.name,
      brand: data.brand,
      category: data.category,
      price: data.price,
      cable_length: data.cable_length,
      serial: "",
    });
    toast.success("Cloned — enter the new serial number");
  };

  const openCloneForNew = () => {
    setComponents((prev) => [...prev, blankChild()]);
    // Defer so the new index exists
    setTimeout(() => setCloneSheetIdx(components.length), 0);
  };

  const formatPrice = (i: number, raw: string) => {
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) updateComponent(i, { price: n.toFixed(2) });
  };

  const CHILD_CATEGORIES = ["Cable", "Case", "Adapter", "Battery", "Mount", "Peripheral", "Accessory", "Other"];

  const updateComputer = (idx: number, patch: Partial<ComputerChild>) => {
    setComputers((prev) => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };
  const addComputer = () => {
    setComputers((prev) => [...prev, { name: `Computer ${prev.length + 1}`, serial: "", value: "", spec: {}, photo: null, photoPreview: null }]);
  };
  const removeComputer = (idx: number) => {
    setComputers((prev) => {
      const removed = prev[idx];
      if (removed?.photoPreview) URL.revokeObjectURL(removed.photoPreview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleComputerPhotoSelect = (idx: number, file: File) => {
    const preview = URL.createObjectURL(file);
    setComputers((prev) => prev.map((c, i) => i === idx ? { ...c, photo: file, photoPreview: preview } : c));
  };

  const removeComputerPhoto = (idx: number) => {
    setComputers((prev) => prev.map((c, i) => {
      if (i === idx && c.photoPreview) {
        URL.revokeObjectURL(c.photoPreview);
        return { ...c, photo: null, photoPreview: null };
      }
      return c;
    }));
  };

  const handlePhotoSelect = (index: number, file: File) => {
    const preview = URL.createObjectURL(file);
    setPhotos((prev) => prev.map((p, i) => i === index ? { ...p, file, preview, uploading: false } : p));
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.map((p, i) => {
      if (i === index) {
        if (p.preview) URL.revokeObjectURL(p.preview);
        return { ...p, file: null, preview: null, uploading: false };
      }
      return p;
    }));
  };

  const uploadPhotos = async (assetId: string) => {
    const photosToUpload = photos.filter((p) => p.file);
    if (photosToUpload.length === 0) return;
    for (const photo of photosToUpload) {
      if (!photo.file) continue;
      try {
        await uploadAssetPhoto(assetId, photo.file, photo.label);
      } catch (error: any) {
        console.error(`Failed to upload ${photo.label} photo:`, error);
        toast.error(`Failed to upload ${photo.label} photo`);
      }
    }
  };

  const handleSave = async () => {
    if (savingRef.current || createAsset.isPending) return;
    savingRef.current = true;
    const parsedValue = parseFloat(originalValue);
    const parentPayload: any = {
      asset_name: assetName,
      category: gearType,
      color_code: selectedColor,
      serial_number: serial || undefined,
      manufacturer: manufacturer || undefined,
      purchased_from: purchasedFrom || undefined,
      purchase_date: purchaseDate ? format(purchaseDate, "yyyy-MM-dd") : undefined,
      condition: condition || "Good",
      original_value: !isNaN(parsedValue) && parsedValue > 0 ? parsedValue : undefined,
      tracking_id: trackingId.trim() || undefined,
    };

    createAsset.mutate(parentPayload, {
      onSuccess: async (data: any) => {
        const assetId = data?.id || data?.[0]?.id;
        if (assetId) {
          await uploadPhotos(assetId);

          // Upload cover photo & gallery, save STORAGE PATHS (never blob URLs)
          let coverPath: string | undefined;
          const galleryPathList: string[] = [];

          if (coverPhoto.file) {
            try {
              coverPath = await uploadAssetPhoto(assetId, coverPhoto.file, "cover");
            } catch (e: any) {
              toast.error(`Cover photo upload failed: ${e.message}`);
            }
          }

          for (const g of galleryPhotos) {
            try {
              galleryPathList.push(await uploadAssetPhoto(assetId, g.file, "gallery"));
            } catch (e: any) {
              toast.error(`Gallery photo upload failed: ${e.message}`);
            }
          }

          if (coverPath || galleryPathList.length > 0) {
            await supabase.from("assets").update({
              ...(coverPath ? { cover_image_url: coverPath } : {}),
              ...(galleryPathList.length > 0 ? { gallery_urls: galleryPathList } : {}),
            } as any).eq("id", assetId);
          }

          // Create child assets
          if (isComputerKit) {
            for (const comp of computers) {
              const compValue = parseFloat(comp.value);
              const { data: childData } = await supabase.from("assets").insert({
                asset_name: comp.name,
                category: "Computer Kit",
                color_code: selectedColor,
                parent_asset_id: assetId,
                serial_number: comp.serial || null,
                original_value: !isNaN(compValue) && compValue > 0 ? compValue : null,
                metadata: comp.spec as any,
                status: "available",
                quantity: 1,
              } as any).select("id").single();
              // Upload per-computer photo
              if (childData?.id && comp.photo) {
                const p = await uploadAssetPhoto(childData.id, comp.photo, "photo").catch(() => null);
                if (p) {
                  await supabase.from("assets").update({ cover_image_url: p } as any).eq("id", childData.id);
                }
              }
            }
          }
          // Save generic child components (for all types including Computer Kit)
          for (const c of components) {
            if (!c.name.trim()) continue;
            const priceNum = parseFloat(c.price);
            const isAtem = /\batem\b/i.test(c.name);
            const childMeta: Record<string, any> = {};
            if (c.notes.trim()) childMeta.notes = c.notes.trim();
            if (isAtem && c.atem_version.trim()) childMeta.atem_version = c.atem_version.trim();
            await supabase.from("assets").insert({
              asset_name: c.name.trim(),
              category: c.category || gearType,
              color_code: selectedColor,
              parent_asset_id: assetId,
              quantity: c.quantity || 1,
              status: "available",
              brand: c.brand || null,
              serial_number: c.serial || null,
              condition: c.condition || "Good",
              original_value: !isNaN(priceNum) && priceNum > 0 ? priceNum : null,
              cable_length: c.category === "Cable" ? (c.cable_length || null) : null,
              ...(Object.keys(childMeta).length > 0 ? { metadata: childMeta } : {}),
            } as any);
          }
        }
        toast.success(`Asset "${assetName}" created successfully!`);
        reset();
        onOpenChange(false);
        savingRef.current = false;
      },
      onError: () => { savingRef.current = false; },
    });
  };

  // Computer Kit: 1=Basic, 2=Computers, 3=Additional Components, 4=Photos, 5=Review
  // Other types:  1=Basic, 2=Components, 3=Photos, 4=Review
  const totalSteps = isComputerKit ? 5 : 4;
  const photoCount = photos.filter((p) => p.file).length;

  const canNext = () => {
    if (step === 1) return gearType && assetName.trim();
    return true;
  };

  const qrCode = `TEL${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Gear — Step {step} of {totalSteps}</DialogTitle>
          <div className="flex gap-1 mt-2">{Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (<div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-muted"}`} />))}</div>
        </DialogHeader>
        <div className="py-4 min-h-[220px]">
          {step === 1 && (
            <div className="space-y-4">
              <div><Label>Gear Type</Label><Select value={gearType} onValueChange={(v) => { if (v === "__add_new__") { setAddingNewType(true); } else { setGearType(v); setAddingNewType(false); } }}><SelectTrigger className="mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger><SelectContent>{allGearTypes.map((g) => (<SelectItem key={g.label} value={g.label}><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: g.color }} />{g.label}</span></SelectItem>))}<SelectItem value="__add_new__"><span className="flex items-center gap-2 text-primary"><Plus className="h-3.5 w-3.5" />Add new type…</span></SelectItem></SelectContent></Select>{addingNewType && (<div className="flex gap-2 mt-2"><Input placeholder="New gear type name…" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomType(); } }} autoFocus /><Button type="button" size="sm" className="rounded-full px-4" onClick={addCustomType}>Add</Button><Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => { setAddingNewType(false); setNewTypeName(""); }}>Cancel</Button></div>)}</div>
              <div><Label>Asset Name</Label><Input className="mt-1" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder='e.g. ProPrompter 19" HD' /></div>
              <div><Label>Serial Number</Label><Input className="mt-1" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="e.g. PP-1921" /></div>
              <div><Label>Manufacturer</Label><Input className="mt-1" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. ProPrompter, Apple" /></div>
              <div><Label>Purchased From</Label><Input className="mt-1" value={purchasedFrom} onChange={(e) => setPurchasedFrom(e.target.value)} placeholder="e.g. B&H Photo, Amazon" /></div>
              <div><Label>Asset Value ($)</Label><Input className="mt-1" type="number" min={0} step={0.01} value={originalValue} onChange={(e) => setOriginalValue(e.target.value)} placeholder="e.g. 1500.00" /></div>
              <div>
                <Label>Purchase Date (approximate is fine)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal", !purchaseDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {purchaseDate ? format(purchaseDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={purchaseDate} onSelect={setPurchaseDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div><Label>Condition</Label><Select value={condition} onValueChange={setCondition}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{CONDITIONS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent></Select></div>
              <div><Label>Tracking Device</Label><Input className="mt-1" value={trackingId} onChange={(e) => setTrackingId(e.target.value)} placeholder="e.g. AirTag: 🎥 Prompter Case A" /></div>
              {/* Cover Photo */}
              <div className="space-y-1.5">
                <Label>Cover Picture</Label>
                <input type="file" accept="image/*" className="hidden" ref={coverPhotoRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCoverPhoto({ file: f, preview: URL.createObjectURL(f) }); } e.target.value = ""; }} />
                {coverPhoto.preview ? (
                  <div className="relative w-full h-32 rounded-lg border border-border overflow-hidden group">
                    <img src={coverPhoto.preview} alt="Cover photo preview of the asset being added" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => { if (coverPhoto.preview) URL.revokeObjectURL(coverPhoto.preview); setCoverPhoto({ file: null, preview: null }); }}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-32 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer" onClick={() => coverPhotoRef.current?.click()}>
                    <Camera className="h-6 w-6" /><span className="text-xs">Add Cover Photo</span>
                  </div>
                )}
              </div>
              {/* Gallery Photos */}
              <div className="space-y-1.5">
                <Label>Gallery Pictures</Label>
                <input type="file" accept="image/*" multiple className="hidden" ref={galleryPhotoRef} onChange={(e) => { const files = Array.from(e.target.files || []); const newPhotos = files.map(f => ({ file: f, preview: URL.createObjectURL(f) })); setGalleryPhotos(prev => [...prev, ...newPhotos]); e.target.value = ""; }} />
                <div className="flex gap-2 flex-wrap">
                  {galleryPhotos.map((g, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-md border border-border overflow-hidden group">
                      <img src={g.preview} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button size="icon" variant="destructive" className="h-5 w-5" onClick={() => { URL.revokeObjectURL(g.preview); setGalleryPhotos(prev => prev.filter((_, idx) => idx !== i)); }}><X className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                  <div className="w-16 h-16 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer" onClick={() => galleryPhotoRef.current?.click()}>
                    <Plus className="h-3.5 w-3.5" /><span className="text-[9px]">Add</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {step === 2 && isComputerKit && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Configure each computer in this kit.</p>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={addComputer}>
                  <Plus className="h-3 w-3" /> Add Computer
                </Button>
              </div>
              {computers.map((comp, idx) => (
                <div key={idx} className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Laptop className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{comp.name || `Computer ${idx + 1}`}</span>
                    </div>
                    {computers.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeComputer(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <Input className="text-[16px] md:text-sm h-8" value={comp.name} onChange={(e) => updateComputer(idx, { name: e.target.value })} placeholder="Computer 1" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Serial Number</Label>
                      <Input className="text-[16px] md:text-sm h-8" value={comp.serial} onChange={(e) => updateComputer(idx, { serial: e.target.value })} placeholder="SN-..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Asset Value ($)</Label>
                      <Input type="number" min={0} step={0.01} className="text-[16px] md:text-sm h-8" value={comp.value} onChange={(e) => updateComputer(idx, { value: e.target.value })} placeholder="0.00" />
                    </div>
                  </div>
                  <ComputerSpecFields
                    spec={comp.spec}
                    onChange={(spec) => updateComputer(idx, { spec })}
                    compact
                  />
                  {/* Per-computer photo */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Photo</Label>
                    <input type="file" accept="image/*" className="hidden" ref={(el) => { computerPhotoRefs.current[idx] = el; }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleComputerPhotoSelect(idx, file); e.target.value = ""; }} />
                    {comp.photoPreview ? (
                      <div className="relative w-20 h-20 rounded-md border border-border overflow-hidden group">
                        <img src={comp.photoPreview} alt={comp.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button size="icon" variant="destructive" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); removeComputerPhoto(idx); }}><X className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer" onClick={() => computerPhotoRefs.current[idx]?.click()}>
                        <Camera className="h-4 w-4" /><span className="text-[10px]">Add</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {((step === 2 && !isComputerKit) || (step === 3 && isComputerKit)) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground flex-1">
                  {isComputerKit ? "Add additional child components (cables, cases, peripherals, etc.)." : "Add child components for this asset."}
                </p>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="secondary" className="gap-1 h-9 text-xs rounded-2xl" onClick={openCloneForNew}>
                    <Copy className="h-3.5 w-3.5" /> Clone
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 h-9 text-xs rounded-2xl" onClick={addComponent}>
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </Button>
                </div>
              </div>
              {components.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center">
                  <p className="text-xs text-muted-foreground italic">No child items yet. Tap "Add Item" or "Clone" to start, or skip this step.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {components.map((c, i) => (
                    <div key={i} className="rounded-2xl border-[1.5px] border-border/60 bg-muted/30 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item {i + 1}</span>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs rounded-full text-primary hover:text-primary" onClick={() => setCloneSheetIdx(i)}>
                            <Copy className="h-3 w-3" /> Clone
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive rounded-full" onClick={() => removeComponent(i)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <Input className="text-[16px] md:text-sm h-10 rounded-xl" value={c.name} onChange={(e) => updateComponent(i, { name: e.target.value })} placeholder="e.g. HDMI Cable" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Brand</Label>
                          <Input className="text-[16px] md:text-sm h-10 rounded-xl" value={c.brand} onChange={(e) => updateComponent(i, { brand: e.target.value })} placeholder="e.g. Anker" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Category</Label>
                          <Select value={c.category} onValueChange={(v) => updateComponent(i, { category: v })}>
                            <SelectTrigger className="h-10 rounded-xl text-[16px] md:text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              {CHILD_CATEGORIES.map((cat) => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Price ($)</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*\.?[0-9]*"
                            className="text-[16px] md:text-sm h-10 rounded-xl"
                            value={c.price}
                            onChange={(e) => updateComponent(i, { price: e.target.value.replace(/[^0-9.]/g, "") })}
                            onBlur={(e) => formatPrice(i, e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Serial</Label>
                          <Input className="text-[16px] md:text-sm h-10 rounded-xl" value={c.serial} onChange={(e) => updateComponent(i, { serial: e.target.value })} placeholder="SN-..." />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Qty</Label>
                          <Input type="number" min={1} inputMode="numeric" className="text-[16px] md:text-sm h-10 rounded-xl" value={c.quantity} onChange={(e) => updateComponent(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Condition</Label>
                        <Select value={c.condition} onValueChange={(v) => updateComponent(i, { condition: v })}>
                          <SelectTrigger className="h-10 rounded-xl text-[16px] md:text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((cond) => (<SelectItem key={cond} value={cond}>{cond}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      {c.category === "Cable" && (
                        <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                          <Label className="text-xs text-muted-foreground">Cable Length</Label>
                          <Input className="text-[16px] md:text-sm h-10 rounded-xl" value={c.cable_length} onChange={(e) => updateComponent(i, { cable_length: e.target.value })} placeholder="e.g. 6 ft, 2 m" />
                        </div>
                      )}
                      {/\batem\b/i.test(c.name) && (
                        <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                          <Label className="text-xs text-muted-foreground">ATEM Version</Label>
                          <Input
                            className="text-[16px] md:text-sm h-10 rounded-xl"
                            value={c.atem_version}
                            onChange={(e) => updateComponent(i, { atem_version: e.target.value })}
                            placeholder="e.g. Mini Pro, 1 M/E v8.6"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Notes <span className="text-muted-foreground/60">(optional)</span></Label>
                        <Input
                          className="text-[16px] md:text-sm h-10 rounded-xl"
                          value={c.notes}
                          onChange={(e) => updateComponent(i, { notes: e.target.value })}
                          placeholder="e.g. Travels with knob, lives in foam slot 3"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {((step === 3 && !isComputerKit) || (step === 4 && isComputerKit)) && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Upload photos for the entire {isComputerKit ? "Computer Kit collection" : "asset"}. Tap a slot to select a photo.</p>
              <div className="grid grid-cols-2 gap-3">
                {photos.map((photo, index) => (
                  <div key={photo.label} className="relative">
                    <input type="file" accept="image/*" className="hidden" ref={(el) => { fileInputRefs.current[index] = el; }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handlePhotoSelect(index, file); e.target.value = ""; }} />
                    {photo.preview ? (
                      <div className="aspect-square rounded-lg border border-border overflow-hidden relative group">
                        <img src={photo.preview} alt={photo.label} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button size="icon" variant="destructive" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); removePhoto(index); }}><X className="h-4 w-4" /></Button>
                        </div>
                        <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">{photo.label}</span>
                      </div>
                    ) : (
                      <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer" onClick={() => fileInputRefs.current[index]?.click()}>
                        <Camera className="h-5 w-5" /><span className="text-xs">{photo.label}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {((step === 4 && !isComputerKit) || (step === 5 && isComputerKit)) && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">Review & Confirm</p>
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="flex items-center gap-1.5 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedColor }} />{gearType || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{assetName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Serial</span><span className="font-medium">{serial || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Manufacturer</span><span className="font-medium">{manufacturer || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Purchased From</span><span className="font-medium">{purchasedFrom || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Purchase Date</span><span className="font-medium">{purchaseDate ? format(purchaseDate, "PPP") : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Asset Value</span><span className="font-medium">{originalValue ? `$${parseFloat(originalValue).toFixed(2)}` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Condition</span><Badge variant="secondary" className="text-xs">{condition}</Badge></div>
                {isComputerKit && <div className="flex justify-between"><span className="text-muted-foreground">Computers</span><span className="font-medium">{computers.length}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Additional Components</span><span className="font-medium">{components.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Photos</span><span className="font-medium">{photoCount}</span></div>
              </div>
              {isComputerKit && computers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Computers</p>
                  {computers.map((comp, idx) => (
                    <div key={idx} className="rounded-md bg-muted/50 p-2 text-xs space-y-0.5">
                      <p className="font-medium text-foreground">{comp.name} {comp.serial && `(${comp.serial})`}</p>
                      <p className="text-muted-foreground">{comp.spec.macbook_type ?? "No model"} {comp.spec.year ?? ""} · {comp.spec.os_version ?? "OS unknown"}</p>
                      {comp.value && <p className="text-muted-foreground">Value: ${parseFloat(comp.value).toFixed(2)}</p>}
                    </div>
                  ))}
                </div>
              )}
              {components.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Additional Components</p>
                  {components.map((c, i) => (
                    <div key={i} className="rounded-md bg-muted/50 p-2 text-xs">
                      <p className="font-medium text-foreground">{c.name} × {c.quantity}</p>
                    </div>
                  ))}
                </div>
              )}
              {photoCount > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {photos.filter((p) => p.preview).map((p) => (
                    <img key={p.label} src={p.preview!} alt={p.label} className="h-16 w-16 rounded-md object-cover border border-border" />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border"><QrCode className="h-10 w-10 text-primary" /><div><p className="text-xs text-muted-foreground">Generated QR Code</p><p className="font-mono font-bold text-foreground">{qrCode}</p></div></div>
            </div>
          )}
        </div>
        <DialogFooter className="flex gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button>}
          {step < totalSteps ? <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>Next</Button> : <Button onClick={handleSave} disabled={createAsset.isPending}>{createAsset.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Asset"}</Button>}
        </DialogFooter>
      </DialogContent>
      <CloneChildAssetSheet
        open={cloneSheetIdx !== null}
        onOpenChange={(v) => { if (!v) setCloneSheetIdx(null); }}
        onSelect={handleCloneFill}
      />
    </Dialog>
  );
}
