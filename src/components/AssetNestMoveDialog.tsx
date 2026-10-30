import { ArrowRightLeft, HandHelping } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AssetNestMoveDialogProps {
  open: boolean;
  itemName: string;
  parentName: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onPermanent: () => void;
  onBorrow: () => void;
}

export function AssetNestMoveDialog({ open, itemName, parentName, pending, onOpenChange, onPermanent, onBorrow }: AssetNestMoveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/70 bg-card/80 backdrop-blur-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move Permanently or Borrow?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Move <strong className="text-foreground">{itemName}</strong> into <strong className="text-foreground">{parentName}</strong> permanently, or remember its current home?
        </p>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <Button variant="outline" className="h-auto min-h-[76px] flex-col rounded-2xl bg-foreground/5" disabled={pending} onClick={onPermanent}>
            <ArrowRightLeft className="h-5 w-5" />
            Move Permanently
          </Button>
          <Button className="h-auto min-h-[76px] flex-col rounded-2xl" disabled={pending} onClick={onBorrow}>
            <HandHelping className="h-5 w-5" />
            Borrow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}