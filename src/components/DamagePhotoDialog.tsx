import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadAssetPhoto } from "@/lib/assetPhotos";
import { toast } from "sonner";

interface DamagePhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  assetName: string;
  onComplete: (photoUrl: string) => void;
}

export function DamagePhotoDialog({ open, onOpenChange, assetId, assetName, onComplete }: DamagePhotoDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadAssetPhoto(assetId, file, "damage");

      const { error } = await supabase.from("assets").update({ damage_photo_url: path } as any).eq("id", assetId);
      if (error) throw error;

      toast.success("Damage photo saved");
      onComplete(path);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>📸 Damage Photo Required</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Please upload a photo showing the damage to <strong>{assetName}</strong>.
        </p>
        <input type="file" accept="image/*" capture="environment" className="hidden" ref={inputRef}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSelect(f); e.target.value = ""; }}
        />
        {preview ? (
          <div className="relative aspect-video rounded-lg border border-border overflow-hidden">
            <img src={preview} alt="Photo showing the reported damage to this gear item" className="w-full h-full object-cover" />
            <Button size="icon" variant="destructive" className="absolute top-2 right-2 h-7 w-7"
              onClick={() => reset()}><X className="h-3.5 w-3.5" /></Button>
          </div>
        ) : (
          <div className="aspect-video rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer"
            onClick={() => inputRef.current?.click()}>
            <Camera className="h-8 w-8" />
            <span className="text-sm">Tap to take or upload photo</span>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Skip</Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</> : "Save Photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
