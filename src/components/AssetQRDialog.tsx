import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Copy } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

interface AssetQRDialogProps {
  open: boolean;
  onClose: () => void;
  assetId: string;
  assetName: string;
}

export function AssetQRDialog({ open, onClose, assetId, assetName }: AssetQRDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `ggasset:${assetId}`, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((err) => console.error("QR generation error:", err));
  }, [open, assetId]);

  const handlePrint = () => window.print();

  const handleCopyLink = () => {
    const url = `${window.location.origin}/scanner?asset=${assetId}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Asset QR Code</DialogTitle>
        </DialogHeader>
        <div id="qr-print-area" className="flex flex-col items-center gap-4 py-4">
          <canvas ref={canvasRef} className="rounded-lg" />
          <p className="text-sm font-semibold text-foreground text-center">{assetName}</p>
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
