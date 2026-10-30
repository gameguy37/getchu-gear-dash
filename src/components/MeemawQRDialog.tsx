import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Copy } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

interface MeemawQRDialogProps {
  open: boolean;
  onClose: () => void;
  kitId: string;
  kitName: string;
  emoji?: string | null;
  caseCount?: number;
}

export function MeemawQRDialog({ open, onClose, kitId, kitName, emoji, caseCount }: MeemawQRDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `ggmeemaw:${kitId}`, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((err) => console.error("QR generation error:", err));
  }, [open, kitId]);

  const handlePrint = () => window.print();

  const handleCopyLink = () => {
    const url = `${window.location.origin}/meemaw-kits/${kitId}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Meemaw Kit QR</DialogTitle>
        </DialogHeader>
        <div id="qr-print-area" className="flex flex-col items-center gap-3 py-4">
          <canvas ref={canvasRef} className="rounded-lg" />
          <p className="text-base font-semibold text-foreground text-center">
            {emoji ?? "👵"} {kitName}
          </p>
          {typeof caseCount === "number" && (
            <p className="text-xs text-muted-foreground">{caseCount} case{caseCount === 1 ? "" : "s"}</p>
          )}
          <p className="text-[10px] text-muted-foreground text-center max-w-[220px]">
            Scan in the app to see contents, cases, and any missing items.
          </p>
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1 gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button className="flex-1 gap-2 rounded-full" onClick={handleCopyLink}>
            <Copy className="h-4 w-4" /> Copy Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
