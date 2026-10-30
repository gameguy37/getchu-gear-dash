import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Plus, Mail, Phone, User, MapPin, Pencil, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClients, useCreateClient, useUpdateClient } from "@/hooks/useSupabaseData";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/LoadingSkeleton";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

const emptyForm = { company_name: "", contact_name: "", email: "", phone: "", on_site_contact: "", street_address: "" };

export default function ClientDirectory() {
  const { data: clients = [], isLoading } = useClients();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  if (isLoading) return <TableSkeleton />;

  const handleCreate = () => {
    if (!form.company_name.trim()) return;
    createClient.mutate(
      {
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        on_site_contact: form.on_site_contact.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Client "${form.company_name}" added!`);
          setForm(emptyForm);
          setCreateOpen(false);
        },
      }
    );
  };

  const openEdit = (client: any) => {
    setEditId(client.id);
    setForm({
      company_name: client.company_name ?? "",
      contact_name: client.contact_name ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      on_site_contact: client.on_site_contact ?? "",
      street_address: client.street_address ?? "",
    });
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editId || !form.company_name.trim()) return;
    updateClient.mutate(
      {
        id: editId,
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        on_site_contact: form.on_site_contact.trim() || undefined,
        street_address: form.street_address.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Client updated!");
          setForm(emptyForm);
          setEditOpen(false);
          setEditId(null);
        },
      }
    );
  };

  const formFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[16px] md:text-sm">Company Name <span className="text-destructive">*</span></Label>
        <Input className="text-[16px] md:text-sm" placeholder="e.g. ABC Studios" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label className="text-[16px] md:text-sm">Contact Name</Label>
        <Input className="text-[16px] md:text-sm" placeholder="e.g. Sarah Mitchell" value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label className="text-[16px] md:text-sm">Email</Label>
        <Input type="email" className="text-[16px] md:text-sm" placeholder="contact@company.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label className="text-[16px] md:text-sm">Phone</Label>
        <Input className="text-[16px] md:text-sm" placeholder="(212) 555-0000" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label className="text-[16px] md:text-sm">On-Site Contact</Label>
        <Input className="text-[16px] md:text-sm" placeholder="e.g. John Doe, (212) 555-1234" value={form.on_site_contact} onChange={(e) => setForm((f) => ({ ...f, on_site_contact: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label className="text-[16px] md:text-sm">Address</Label>
        <Input className="text-[16px] md:text-sm" placeholder="123 Broadway, New York" value={form.street_address} onChange={(e) => setForm((f) => ({ ...f, street_address: e.target.value }))} />
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clients</h1>
            <p className="text-sm text-muted-foreground">{clients.length} clients</p>
          </div>
        </div>
        <Button onClick={() => { setForm(emptyForm); setCreateOpen(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Client
        </Button>
      </div>

      <Card className="rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden md:table-cell">On-Site Contact</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client: any, i: number) => (
              <motion.tr key={client.id} custom={i} variants={fadeUp} initial="hidden" animate="show" className="border-b">
                <TableCell>
                  <span className="font-medium text-foreground">{client.company_name}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <User className="h-3 w-3" />
                    {client.contact_name || "—"}
                  </div>
                  {client.email && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Mail className="h-3 w-3" />
                      {client.email}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {client.phone || "—"}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserCheck className="h-3 w-3" />
                    {client.on_site_contact || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(client)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </motion.tr>
            ))}
            {clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No clients yet</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.company_name.trim() || createClient.isPending}>
              {createClient.isPending ? "Creating…" : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!form.company_name.trim() || updateClient.isPending}>
              {updateClient.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
