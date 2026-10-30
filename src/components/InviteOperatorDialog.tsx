import { useState } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (employeeId: string) => void;
}

export function InviteOperatorDialog({ open, onOpenChange, onInvited }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const parsed = schema.safeParse({ name, email });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSaving(true);
    const { data: existing } = await supabase.from("employees").select("id, name").ilike("email", parsed.data.email).maybeSingle();
    if (existing) {
      setSaving(false);
      toast.info(`${existing.name ?? parsed.data.email} is already on the crew — selected them.`);
      onInvited(existing.id);
      onOpenChange(false);
      return;
    }
    const { data, error } = await supabase
      .from("employees")
      .insert({ name: parsed.data.name, email: parsed.data.email, role: "operator", status: "invited" })
      .select("*")
      .single();
    setSaving(false);
    if (error || !data) { toast.error(`Invite failed: ${error?.message}`); return; }
    // Put them in the cached list right away so the dropdown can show the selection.
    qc.setQueryData<any[]>(["employees"], (cur) => [
      ...(cur ?? []),
      { id: data.id, name: data.name ?? "", email: data.email ?? "", phone: "", role: "operator", user_type: "operator", points: 0, status: "invited" },
    ]);
    qc.invalidateQueries({ queryKey: ["employees"] });
    toast.success(`${data.name} invited & assigned`);
    onInvited(data.id);
    setName(""); setEmail("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px] rounded-2xl bg-card/80 backdrop-blur-xl border-border/60 z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /> Invite New Operator</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Operator Name</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan Reyes" className="h-12 rounded-xl text-[16px] md:text-sm" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label>Operator Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-12 rounded-xl text-[16px] md:text-sm" maxLength={255}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
          </div>
          <p className="text-xs text-muted-foreground">They'll be able to sign in with this email — no approval step needed.</p>
          <Button className="h-12 w-full rounded-full" onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite & Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
