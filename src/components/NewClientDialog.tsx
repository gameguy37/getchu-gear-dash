import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateClient } from "@/hooks/useSupabaseData";
import { toast } from "sonner";

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (companyName: string) => void;
}

export function NewClientDialog({ open, onOpenChange, onCreated }: NewClientDialogProps) {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [onSiteContactName, setOnSiteContactName] = useState("");
  const [onSiteContactPhone, setOnSiteContactPhone] = useState("");
  const createClient = useCreateClient();

  const reset = () => {
    setCompanyName("");
    setEmail("");
    setPhone("");
    setContactName("");
    setOnSiteContactName("");
    setOnSiteContactPhone("");
  };

  const handleSubmit = () => {
    if (!companyName.trim()) return;
    createClient.mutate(
      {
        company_name: companyName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        contact_name: contactName.trim() || undefined,
        on_site_contact: onSiteContactName.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          toast.success(`Client "${data.company_name}" created!`);
          onCreated(data.company_name);
          reset();
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-[16px] md:text-sm">Company Name <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. ABC Studios" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="text-[16px] md:text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] md:text-sm">Contact Name</Label>
            <Input placeholder="e.g. Sarah Mitchell" value={contactName} onChange={(e) => setContactName(e.target.value)} className="text-[16px] md:text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] md:text-sm">Email</Label>
            <Input type="email" placeholder="client@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="text-[16px] md:text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] md:text-sm">Phone</Label>
            <Input type="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} className="text-[16px] md:text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] md:text-sm">On-Site Contact Name</Label>
            <Input placeholder="e.g. John Doe" value={onSiteContactName} onChange={(e) => setOnSiteContactName(e.target.value)} className="text-[16px] md:text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] md:text-sm">On-Site Contact Phone</Label>
            <Input type="tel" placeholder="(212) 555-1234" value={onSiteContactPhone} onChange={(e) => setOnSiteContactPhone(e.target.value)} className="text-[16px] md:text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!companyName.trim() || createClient.isPending}>
            {createClient.isPending ? "Creating…" : "Create Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
