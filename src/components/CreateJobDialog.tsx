import { InviteOperatorDialog } from "@/components/InviteOperatorDialog";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { format, startOfDay, isBefore, isToday } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarIcon,
  Clock,
  MapPin,
  Plus,
  Trash2,
  AlertTriangle,
  Monitor,
  CheckCircle2,
  Building2,
  UserCheck,
  Search,
  Loader2,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { useAssets, useParentAssets, useEmployees, useClients, useAssignments, useCreateJob, useCreateAssignment, useJobs } from "@/hooks/useSupabaseData";
import { useUnavailableAssetIds } from "@/hooks/useAssetAvailability";
import { useKitIndex } from "@/hooks/useMeemawKits";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NewClientDialog } from "@/components/NewClientDialog";

const LOCATION_TYPES = [
  { value: "Manhattan", offset: 45 },
  { value: "Outer Boro", offset: 75 },
  { value: "Tri-State / Road Trip", offset: 90 },
  { value: "Other", offset: 60 },
];

// Auto-detect location type from address string
function detectLocationFromAddress(addr: string): string | null {
  if (!addr) return null;
  const lower = addr.toLowerCase();

  // Manhattan detection
  const manhattanAreas = ["manhattan", "new york, ny 100", "new york, ny 101", "midtown", "harlem", "soho", "tribeca", "chelsea", "gramercy", "flatiron", "murray hill", "upper east", "upper west", "lower east", "lower manhattan", "financial district", "wall street", "times square", "hell's kitchen", "east village", "west village", "greenwich village", "noho", "nolita", "chinatown", "little italy", "battery park"];
  if (manhattanAreas.some((a) => lower.includes(a))) return "Manhattan";

  // Outer borough detection
  const outerBoros = ["brooklyn", "queens", "bronx", "staten island", "long island city", "astoria", "flushing", "jamaica", "bay ridge", "williamsburg", "bushwick", "bed-stuy", "bedford-stuyvesant", "park slope", "dumbo", "red hook", "sunset park", "flatbush", "crown heights", "prospect", "greenpoint", "woodside", "jackson heights", "elmhurst", "forest hills", "rego park", "kew gardens", "riverdale", "fordham", "pelham", "mott haven", "hunts point", "concourse"];
  const outerBoroZips = ["112", "104", "114", "116", "111", "103"];
  if (outerBoros.some((a) => lower.includes(a))) return "Outer Boro";
  if (outerBoroZips.some((z) => lower.includes(`, ny ${z}`))) return "Outer Boro";

  // Tri-State detection
  const triState = [", nj", ", ct", ", pa", "new jersey", "connecticut", "pennsylvania", "jersey city", "hoboken", "newark", "stamford", "white plains", "yonkers", "westchester", "long island", ", li", "nassau", "suffolk"];
  if (triState.some((a) => lower.includes(a))) return "Tri-State / Road Trip";

  return null;
}

const PROMPTER_CATEGORIES = ["Through The Lens", "Presidential", "Robotic Presidential", "Wedgeprompt (tm)"];
const COMPUTER_CATEGORY = "Computer Kit";

function calcArrivalTime(callTime: string, locationType: string): string | null {
  if (!callTime || !locationType) return null;
  const loc = LOCATION_TYPES.find((l) => l.value === locationType);
  if (!loc) return null;

  const [h, m] = callTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;

  const totalMins = h * 60 + m - loc.offset;
  const arrH = Math.floor(((totalMins % 1440) + 1440) % 1440 / 60);
  const arrM = ((totalMins % 1440) + 1440) % 1440 % 60;

  const period = arrH >= 12 ? "PM" : "AM";
  const display = arrH === 0 ? 12 : arrH > 12 ? arrH - 12 : arrH;
  return `${display}:${String(arrM).padStart(2, "0")} ${period}`;
}

function formatCallTime(callTime: string): string {
  if (!callTime) return "";
  const [h, m] = callTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return callTime;
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateJobDialog({ open, onOpenChange }: CreateJobDialogProps) {
  const { data: allAssets = [] } = useAssets();
  const { data: parentAssetsQuery = [] } = useParentAssets();
  const { data: allEmployees = [] } = useEmployees();
  const { data: clients = [] } = useClients();
  const { data: allAssignments = [] } = useAssignments();
  const { data: allJobs = [] } = useJobs();
  const createJobMutation = useCreateJob();
  const createAssignmentMutation = useCreateAssignment();

  const [jobNumber, setJobNumber] = useState("");
  const [jobName, setJobName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [locationType, setLocationType] = useState("");
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [endDate, setEndDate] = useState<Date>();
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [callTime, setCallTime] = useState("08:00"); // Default 8am
  const [selectedOperatorId, setSelectedOperatorId] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [clientEmail, setClientEmail] = useState("");
  const [onSiteContactName, setOnSiteContactName] = useState("");
  const [onSiteContactPhone, setOnSiteContactPhone] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [guaranteedHours, setGuaranteedHours] = useState("");
  const [pastDateConfirmOpen, setPastDateConfirmOpen] = useState(false);
  const [distanceMiles, setDistanceMiles] = useState("");
  const [mileageReimbursement, setMileageReimbursement] = useState("");
  const [mileageOverridden, setMileageOverridden] = useState(false);

  const operators = allEmployees.filter((u) => u.user_type === "operator" && (u.status === "active" || u.status === "invited"));
  const parentAssets = parentAssetsQuery.length > 0
    ? parentAssetsQuery
    : allAssets.filter((a) => !a.parent_asset_id);
  const { assetIdToKit } = useKitIndex();

  // Compute unavailable assets for the selected date/time window
  const unavailableAssetIds = useUnavailableAssetIds(
    allJobs,
    allAssignments,
    startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    callTime || "08:00",
    guaranteedHours || "8"
  );

  // Filter clients by search term
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return (clients as any[]).filter((c: any) => c.company_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const displayClients = clientDropdownOpen ? (clientSearch.trim() ? filteredClients : clients) : [];

  const arrivalTime = useMemo(
    () => calcArrivalTime(callTime, locationType),
    [callTime, locationType]
  );

  const locOffset = LOCATION_TYPES.find((l) => l.value === locationType)?.offset;

  const hasPrompter = selectedAssetIds.some((id) => {
    const asset = allAssets.find((a) => a.id === id);
    return asset && PROMPTER_CATEGORIES.includes(asset.category);
  });
  const hasComputer = selectedAssetIds.some((id) => {
    const asset = allAssets.find((a) => a.id === id);
    return asset && asset.category === COMPUTER_CATEGORY;
  });
  const showComputerWarning = hasPrompter && !hasComputer;

  const addAsset = (assetId: string) => {
    setSelectedAssetIds((prev) => prev.includes(assetId) ? prev : [...prev, assetId]);
  };

  const addAssets = (assetIds: string[]) => {
    setSelectedAssetIds((prev) => {
      const next = [...prev];
      assetIds.forEach((id) => { if (!next.includes(id)) next.push(id); });
      return next;
    });
  };

  const removeAsset = (assetId: string) => {
    setSelectedAssetIds((prev) => prev.filter((id) => id !== assetId));
  };

  const resetForm = () => {
    setJobNumber("");
    setJobName("");
    setClientName("");
    setClientSearch("");
    setClientEmail("");
    setOnSiteContactName("");
    setOnSiteContactPhone("");
    setLocationType("");
    setAddress("");
    setStartDate(undefined);
    setIsMultiDay(false);
    setEndDate(undefined);
    setCallTime("");
    setSelectedOperatorId("");
    setSelectedAssetIds([]);
    setGuaranteedHours("");
    setDistanceMiles("");
    setMileageReimbursement("");
    setMileageOverridden(false);
    setFieldErrors({});
  };

  const handleClientSelect = (val: string) => {
    setClientName(val);
    setClientSearch("");
    const matched = clients.find((c: any) => c.company_name === val);
    if (matched) {
      setClientEmail(matched.email ?? "");
      setOnSiteContactName((matched as any).on_site_contact_name ?? (matched as any).on_site_contact ?? "");
      setOnSiteContactPhone((matched as any).on_site_contact_phone ?? "");

      // Auto-populate address from client's stored address
      const parts = [
        (matched as any).street_address,
        (matched as any).city,
        (matched as any).state,
        (matched as any).zip,
      ].filter(Boolean);
      if (parts.length > 0) {
        const fullAddr = parts.join(", ");
        setAddress(fullAddr);
        const detected = detectLocationFromAddress(fullAddr);
        if (detected) setLocationType(detected);
      }
    } else {
      setClientEmail("");
      setOnSiteContactName("");
      setOnSiteContactPhone("");
    }
  };

  const handleAddressChange = (val: string) => {
    setAddress(val);
    const detected = detectLocationFromAddress(val);
    if (detected) setLocationType(detected);
  };

  // Auto-generate job number from client name + date
  const autoJobNumber = useMemo(() => {
    if (!clientName.trim() || !startDate) return "";
    const prefix = clientName.trim().substring(0, 3);
    const m = startDate.getMonth() + 1;
    const d = startDate.getDate();
    const y = String(startDate.getFullYear()).slice(-2);
    return `${prefix} ${m}${d}${y}`;
  }, [clientName, startDate]);

  const effectiveJobNumber = jobNumber.trim() || autoJobNumber;

  // Smart call time: compute minimum time if job date is today
  const minCallTime = useMemo(() => {
    if (!startDate || !isToday(startDate)) return undefined;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }, [startDate]);

  // If date changes to today and current call time is before now, bump it
  useEffect(() => {
    if (minCallTime && callTime && callTime < minCallTime) {
      setCallTime(minCallTime);
    }
  }, [minCallTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background mileage calculation when address changes
  const mileageCalcRef = useRef<ReturnType<typeof setTimeout>>();
  const calculateMileage = useCallback(async (dest: string) => {
    if (!dest || dest.length < 5 || mileageOverridden) return;
    try {
      const { data, error } = await supabase.functions.invoke("maps-proxy", {
        body: { action: "distance", origin: "131 Varick St, New York, NY 10013", destination: dest },
      });
      if (!error && data?.distanceMiles) {
        // Round-trip: double the one-way distance returned by the maps proxy
        const miles = Math.round(data.distanceMiles * 2 * 10) / 10;
        if (miles > 50) {
          setDistanceMiles(String(miles));
          if (!mileageOverridden) {
            setMileageReimbursement((miles * 0.725).toFixed(2));
          }
        } else {
          setDistanceMiles(String(miles));
          if (!mileageOverridden) {
            setMileageReimbursement("0");
          }
        }
      }
    } catch {
      // silently fail — user can still enter manually
    }
  }, [mileageOverridden]);

  useEffect(() => {
    if (mileageCalcRef.current) clearTimeout(mileageCalcRef.current);
    if (address && address.length >= 5) {
      mileageCalcRef.current = setTimeout(() => calculateMileage(address), 1500);
    }
    return () => { if (mileageCalcRef.current) clearTimeout(mileageCalcRef.current); };
  }, [address, calculateMileage]);

  const canSubmit = clientName.trim() && locationType && startDate && callTime;
  const isSaving = createJobMutation.isPending;

  const [fieldErrors, setFieldErrors] = useState<{ client?: boolean; location?: boolean; date?: boolean; callTime?: boolean }>({});

  const validateForm = (): boolean => {
    const errors = {
      client: !clientName.trim(),
      location: !locationType,
      date: !startDate,
      callTime: !callTime,
    };
    setFieldErrors(errors);
    const missing: string[] = [];
    if (errors.client) missing.push("Client Name");
    if (errors.location) missing.push("Location Type");
    if (errors.date) missing.push("Start Date");
    if (errors.callTime) missing.push("Call Time");
    if (missing.length > 0) {
      toast.error(`Missing required fields: ${missing.join(", ")}`);
      return false;
    }
    return true;
  };

  const handleSubmit = () => {
    if (isSaving) return;
    if (!validateForm() || !startDate) return;

    // Check if date is in the past
    if (isBefore(startOfDay(startDate), startOfDay(new Date()))) {
      setPastDateConfirmOpen(true);
      return;
    }

    submitJob();
  };

  const submitJob = () => {
    if (isSaving || !canSubmit || !startDate) return;
    const dateStr = format(startDate, "yyyy-MM-dd");

    createJobMutation.mutate(
      {
        client_name: clientName,
        job_number: effectiveJobNumber || undefined,
        job_date: dateStr,
        status: "needs_prep",
        location_type: locationType,
        notes: jobName || undefined,
        call_time: callTime || undefined,
        address: address || undefined,
        guaranteed_hours: guaranteedHours || undefined,
        distance_miles: distanceMiles ? parseFloat(distanceMiles) : null,
        mileage_reimbursement: mileageReimbursement ? parseFloat(mileageReimbursement) : null,
      },
      {
        onSuccess: (newJob) => {
          const assetNames = selectedAssetIds.map((id) => {
            const a = allAssets.find((x) => x.id === id);
            return a ? `${a.asset_name} (${a.category})` : id;
          });

          if (selectedOperatorId) {
            createAssignmentMutation.mutate({
              job_id: newJob.id,
              operator_id: selectedOperatorId,
              asset_ids: [...selectedAssetIds],
            });

            // Send push notification to assigned operator
            supabase.functions.invoke("send-push", {
              body: {
                employee_ids: [selectedOperatorId],
                title: "New Job Assigned",
                message: `${clientName} on ${dateStr}${callTime ? ` at ${callTime}` : ""}${address ? ` — ${address}` : ""}`,
              },
            }).catch((err) => console.error("[push] Failed:", err));
          }

          // Build email payloads and send via edge function
          const emails: any[] = [];
          const appBaseUrl = window.location.origin;

          if (selectedOperatorId) {
            const op = allEmployees.find((e) => e.id === selectedOperatorId);
            if (op?.email) {
              emails.push({
                type: "operator",
                to: op.email,
                recipientName: op.name,
                jobDetails: {
                  jobNumber: newJob.job_number,
                  clientName: clientName,
                  jobDate: dateStr,
                  callTime: callTime || undefined,
                  arrivalTime: arrivalTime || undefined,
                  locationType,
                  address: address || undefined,
                  guaranteedHours: guaranteedHours || undefined,
                  assets: assetNames,
                  jobUrl: `${appBaseUrl}/`,
                },
              });
            }
          }

          if (clientEmail) {
            emails.push({
              type: "client",
              to: clientEmail,
              recipientName: clientName,
              jobDetails: {
                jobNumber: newJob.job_number,
                clientName: clientName,
                jobDate: dateStr,
                callTime: callTime || undefined,
                locationType,
                address: address || undefined,
                assets: assetNames,
              },
            });
          }

          resetForm();
          onOpenChange(false);

          if (emails.length > 0) {
            supabase.functions.invoke("send-job-emails", { body: { emails } })
              .then(({ error }) => {
                if (error) {
                  console.error("[send-job-emails] Error:", error);
                  toast.success("Job created! (email send failed)");
                } else {
                  toast.success("Job Created & Emails Sent!");
                }
              });
          } else {
            toast.success("Job created!");
          }
        },
        onError: (err: any) => {
          toast.error(err?.message ? `Couldn't save job: ${err.message}` : "Couldn't save job. Please try again.");
        },
      }
    );
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[540px] overflow-y-auto" onInteractOutside={(e) => { if ((e.target as HTMLElement)?.closest?.('.pac-container')) e.preventDefault(); }}>
        <SheetHeader>
          <SheetTitle className="text-xl">Create New Job</SheetTitle>
        </SheetHeader>

        <div className="space-y-8 py-4">
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5" /> Basic Details
            </h3>
            <div className="space-y-2">
              <Label htmlFor="cj-jobnumber" className="text-[16px] md:text-sm">Job Number</Label>
              <Input id="cj-jobnumber" placeholder={autoJobNumber || "Auto-generated from client + date"} className="text-[16px] md:text-sm" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} />
              {!jobNumber && autoJobNumber && (
                <p className="text-xs text-muted-foreground">Will use: <span className="font-medium">{autoJobNumber}</span></p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cj-jobname" className="text-[16px] md:text-sm">Job Name</Label>
              <Input id="cj-jobname" placeholder="e.g. Morning Show Setup" className="text-[16px] md:text-sm" value={jobName} onChange={(e) => setJobName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cj-client" className="text-[16px] md:text-sm">Client Name <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1 relative">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search or type client name..."
                      className={cn("text-[16px] md:text-sm pl-8", fieldErrors.client && "border-destructive ring-1 ring-destructive/50")}
                      value={clientSearch || clientName}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        setClientName(e.target.value);
                        setClientDropdownOpen(true);
                        setFocusedIndex(-1);
                        if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, client: false }));
                      }}
                      onFocus={() => {
                        setClientDropdownOpen(true);
                        if (clientName && !clientSearch) setClientSearch(clientName);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setClientDropdownOpen(false);
                          if (clientSearch && !clientName) setClientName(clientSearch);
                          setClientSearch("");
                          setFocusedIndex(-1);
                        }, 200);
                      }}
                      onKeyDown={(e) => {
                        if (!clientDropdownOpen || displayClients.length === 0) return;
                        if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIndex((i) => Math.min(i + 1, displayClients.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIndex((i) => Math.max(i - 1, 0)); }
                        else if (e.key === "Enter" && focusedIndex >= 0) { e.preventDefault(); handleClientSelect((displayClients[focusedIndex] as any).company_name); setClientDropdownOpen(false); }
                        else if (e.key === "Escape") { setClientDropdownOpen(false); }
                      }}
                    />
                  </div>
                  {clientDropdownOpen && displayClients.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 rounded-xl border bg-popover shadow-md max-h-64 overflow-y-auto">
                      {(displayClients as any[]).map((c: any, i: number) => (
                        <button
                          key={c.id}
                          type="button"
                          className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors", i === focusedIndex && "bg-accent text-accent-foreground")}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { handleClientSelect(c.company_name); setClientDropdownOpen(false); }}
                        >
                          <span className="font-medium">{c.company_name}</span>
                          {c.email && <span className="text-xs text-muted-foreground ml-2">{c.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1" onClick={() => setNewClientOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
              </div>
              {fieldErrors.client && <p className="text-xs text-destructive font-medium">Client Name is required</p>}
              <NewClientDialog open={newClientOpen} onOpenChange={setNewClientOpen} onCreated={(name) => { handleClientSelect(name); setClientSearch(""); setFieldErrors((p) => ({ ...p, client: false })); }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cj-client-email" className="text-[16px] md:text-sm">Client Email</Label>
              <Input id="cj-client-email" type="email" placeholder="client@example.com" className="text-[16px] md:text-sm" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cj-address" className="text-[16px] md:text-sm">Address</Label>
              <AddressAutocomplete value={address} onChange={handleAddressChange} placeholder="123 Broadway, Empire State Building, etc." />
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Location Type <span className="text-destructive">*</span></Label>
              <Select value={locationType} onValueChange={(v) => { setLocationType(v); setFieldErrors((p) => ({ ...p, location: false })); }}>
                <SelectTrigger className={cn("text-[16px] md:text-sm", fieldErrors.location && "border-destructive ring-1 ring-destructive/50")}><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((l) => (<SelectItem key={l.value} value={l.value}>{l.value} (−{l.offset} min)</SelectItem>))}
                </SelectContent>
              </Select>
              {fieldErrors.location && <p className="text-xs text-destructive font-medium">Location Type is required</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cj-onsite-name" className="text-[16px] md:text-sm">On-Site Contact Name</Label>
              <Input id="cj-onsite-name" placeholder="e.g. John Doe" className="text-[16px] md:text-sm" value={onSiteContactName} onChange={(e) => setOnSiteContactName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cj-onsite-phone" className="text-[16px] md:text-sm">On-Site Contact Phone</Label>
              <Input id="cj-onsite-phone" type="tel" placeholder="(212) 555-1234" className="text-[16px] md:text-sm" value={onSiteContactPhone} onChange={(e) => setOnSiteContactPhone(e.target.value)} />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> Schedule & Time
            </h3>
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Start Date <span className="text-destructive">*</span></Label>
              <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left text-[16px] md:text-sm font-normal", !startDate && "text-muted-foreground", fieldErrors.date && "border-destructive ring-1 ring-destructive/50")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setStartDateOpen(false); if (d) setFieldErrors((p) => ({ ...p, date: false })); }} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              {fieldErrors.date && <p className="text-xs text-destructive font-medium">Start Date is required</p>}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <Label htmlFor="cj-multiday" className="text-[16px] md:text-sm cursor-pointer">Multi-Day Job</Label>
              <Switch id="cj-multiday" checked={isMultiDay} onCheckedChange={setIsMultiDay} />
            </div>
            <AnimatePresence>
              {isMultiDay && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                  <Label className="text-[16px] md:text-sm">End Date</Label>
                  <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left text-[16px] md:text-sm font-normal", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP") : "Pick end date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndDateOpen(false); }} disabled={(d) => (startDate ? d < startDate : false)} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="space-y-2">
              <Label htmlFor="cj-calltime" className="text-[16px] md:text-sm">Call Time <span className="text-destructive">*</span></Label>
              <Input id="cj-calltime" type="time" className={cn("text-[16px] md:text-sm", fieldErrors.callTime && "border-destructive ring-1 ring-destructive/50")} value={callTime} min={minCallTime} onChange={(e) => {
                const val = e.target.value;
                if (minCallTime && val < minCallTime) {
                  setCallTime(minCallTime);
                } else {
                  setCallTime(val);
                }
                if (val) setFieldErrors((p) => ({ ...p, callTime: false }));
              }} />
              {fieldErrors.callTime && <p className="text-xs text-destructive font-medium">Call Time is required</p>}
              {minCallTime && (
                <p className="text-[10px] text-muted-foreground">Today's minimum: {formatCallTime(minCallTime)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Guaranteed Hours</Label>
              <Select value={guaranteedHours} onValueChange={setGuaranteedHours}>
                <SelectTrigger className="text-[16px] md:text-sm"><SelectValue placeholder="Select hours" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8 Hours</SelectItem>
                  <SelectItem value="10">10 Hours</SelectItem>
                  <SelectItem value="12">12 Hours</SelectItem>
                  <SelectItem value="3">Delivery (3 Hours)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Mileage Reimbursement */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cj-distance" className="text-[16px] md:text-sm">Total Miles from Office</Label>
                <Input
                  id="cj-distance"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="e.g. 65"
                  className="text-[16px] md:text-sm"
                  value={distanceMiles}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDistanceMiles(val);
                    setMileageOverridden(false);
                    const miles = parseFloat(val);
                    if (!isNaN(miles) && miles > 50) {
                      setMileageReimbursement((miles * 0.725).toFixed(2));
                    } else {
                      setMileageReimbursement("0");
                    }
                  }}
                />
                <p className="text-[10px] text-muted-foreground">From 131 Varick St</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cj-mileage" className="text-[16px] md:text-sm">Mileage Reimbursement ($)</Label>
                <Input
                  id="cj-mileage"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Auto-calculated"
                  className="text-[16px] md:text-sm"
                  value={mileageReimbursement}
                  onChange={(e) => {
                    setMileageReimbursement(e.target.value);
                    setMileageOverridden(true);
                  }}
                />
                {!mileageOverridden && distanceMiles && parseFloat(distanceMiles) > 50 && (
                  <p className="text-[10px] text-muted-foreground">Auto: {distanceMiles} mi × $0.725/mi</p>
                )}
                {mileageOverridden && (
                  <p className="text-[10px] text-warning">Manual override</p>
                )}
              </div>
            </div>

            <AnimatePresence>
              {arrivalTime && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 shrink-0">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Office Arrival Time</p>
                      <p className="text-2xl font-bold text-foreground mt-0.5">{arrivalTime}</p>
                      <p className="text-xs text-muted-foreground mt-1">{locationType} — {locOffset} min before call time ({formatCallTime(callTime)})</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Monitor className="h-3.5 w-3.5" /> Crew & Gear Assignment
            </h3>
            <OperatorSelector
              operators={operators}
              selectedOperatorId={selectedOperatorId}
              onSelect={setSelectedOperatorId}
              startDate={startDate}
              allAssignments={allAssignments}
            />
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Add Gear</Label>
              <GearSelector
                allAssets={allAssets}
                parentAssets={parentAssets}
                selectedAssetIds={selectedAssetIds}
                allAssignments={allAssignments}
                startDate={startDate}
                callTime={callTime}
                guaranteedHours={guaranteedHours}
                onAdd={addAsset}
                onAddMany={addAssets}
              />
              {(() => {
                // Count assets booked during overlapping windows (handled by GearSelector)
                return null;
              })()}
            </div>
            {selectedAssetIds.length > 0 && (
              <div className="space-y-1.5">
                {selectedAssetIds.map((id) => {
                  const asset = allAssets.find((a) => a.id === id);
                  if (!asset) return null;
                  const kit = assetIdToKit.get(id);
                  return (
                    <div key={id} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-muted/50">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: asset.color_code }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{asset.asset_name}</p>
                        {kit && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {kit.emoji ?? "👵"} from {kit.name}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{asset.category}</Badge>
                      <button onClick={() => removeAsset(id)} className="p-1 rounded-md hover:bg-destructive/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Flagged gear warning */}
            {selectedAssetIds.length > 0 && (() => {
              const flaggedChildren = selectedAssetIds.flatMap((id) => {
                const children = allAssets.filter((a) => a.parent_asset_id === id);
                return children.filter((c) => ["missing", "broken", "iffy"].includes(c.status ?? ""));
              });
              const flaggedParents = selectedAssetIds.map((id) => allAssets.find((a) => a.id === id)).filter((a) => a && ["missing", "broken", "iffy"].includes(a?.status ?? ""));
              const allFlagged = [...flaggedParents, ...flaggedChildren];
              if (allFlagged.length === 0) return null;
              return (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">⚠️ Flagged Gear in This Kit</p>
                    <ul className="mt-1 space-y-0.5">
                      {allFlagged.map((item) => item && (
                        <li key={item.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${item.status === "broken" ? "bg-destructive" : item.status === "missing" ? "bg-destructive" : "bg-warning"}`} />
                          <span className="font-medium text-foreground">{item.asset_name}</span>
                          <span className="capitalize">— {item.status}</span>
                          {item.damage_notes && <span className="text-foreground/60">({item.damage_notes})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })()}
            <AnimatePresence>
              {showComputerWarning && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Missing Brain!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">You assigned a prompter but no computer. Add a MacBook to complete this kit!</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        <SheetFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isSaving ? "Saving..." : "Save & Schedule Job"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    <AlertDialog open={pastDateConfirmOpen} onOpenChange={setPastDateConfirmOpen}>
      <AlertDialogContent className="glass-dark border-warning/30">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-warning text-lg">
            <AlertTriangle className="h-6 w-6" />
            Hey Time Traveler! 🦋
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-foreground/90 text-base leading-relaxed space-y-3">
              <p className="text-lg font-medium">Your date is in the past!</p>
              <p className="text-sm text-muted-foreground">
                You selected <span className="font-semibold text-warning">{startDate ? format(startDate, "PPP") : ""}</span>.
              </p>
              <p className="text-sm text-muted-foreground italic">
                Don't step on any butterflies! 🦋
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel className="sm:flex-1">Go Back and Change</AlertDialogCancel>
          <AlertDialogAction className="sm:flex-1" onClick={() => { setPastDateConfirmOpen(false); submitJob(); }}>
            It's Okay
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// Sub-component for operator selection with double-booking lock
function OperatorSelector({
  operators,
  selectedOperatorId,
  onSelect,
  startDate,
  allAssignments,
}: {
  operators: any[];
  selectedOperatorId: string;
  onSelect: (id: string) => void;
  startDate: Date | undefined;
  allAssignments: any[];
}) {
  const { data: jobs = [] } = useJobs();
  const [allowDoubleDip, setAllowDoubleDip] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const bookedOperatorIds = useMemo(() => {
    if (!startDate) return new Set<string>();
    const dateStr = format(startDate, "yyyy-MM-dd");
    const jobIdsOnDate = new Set(
      jobs.filter((j: any) => j.job_date === dateStr && j.status !== "cancelled").map((j: any) => j.id)
    );
    const booked = new Set<string>();
    allAssignments.forEach((a: any) => {
      if (jobIdsOnDate.has(a.job_id) && a.operator_id) {
        booked.add(a.operator_id);
      }
    });
    return booked;
  }, [startDate, jobs, allAssignments]);

  // Build a map of operator_id -> [{date, clientName, callTime}]
  const operatorBookings = useMemo(() => {
    const map = new Map<string, { date: string; clientName: string; callTime?: string }[]>();
    allAssignments.forEach((a: any) => {
      if (!a.operator_id || !a.job_id) return;
      const job = jobs.find((j: any) => j.id === a.job_id && j.status !== "cancelled");
      if (!job) return;
      const existing = map.get(a.operator_id) || [];
      existing.push({
        date: job.job_date,
        clientName: job.client_name || "Unknown",
        callTime: job.call_time,
      });
      map.set(a.operator_id, existing);
    });
    // Sort each operator's bookings by date
    map.forEach((bookings) => bookings.sort((a, b) => a.date.localeCompare(b.date)));
    return map;
  }, [jobs, allAssignments]);

  const hasBookedOperators = bookedOperatorIds.size > 0;

  return (
    <div className="space-y-2">
      <Label className="text-[16px] md:text-sm">Assign Operator</Label>
      {hasBookedOperators && (
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
          <Label htmlFor="double-dip" className="text-xs cursor-pointer text-muted-foreground">Allow Double Booking (Double Dip Day)</Label>
          <Switch id="double-dip" checked={allowDoubleDip} onCheckedChange={setAllowDoubleDip} />
        </div>
      )}
      <Select value={selectedOperatorId} onValueChange={(v) => (v === "__invite__" ? setInviteOpen(true) : onSelect(v))}>
        <SelectTrigger className="text-[16px] md:text-sm"><SelectValue placeholder="Select operator" /></SelectTrigger>
        <SelectContent>
          {operators.map((op) => {
            const isBooked = bookedOperatorIds.has(op.id);
            const disabled = isBooked && !allowDoubleDip;
            const bookings = operatorBookings.get(op.id) || [];
            const upcomingBookings = bookings.filter((b) => b.date >= format(new Date(), "yyyy-MM-dd")).slice(0, 5);

            if (isBooked && upcomingBookings.length > 0) {
              return (
                <HoverCard key={op.id} openDelay={200} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <div>
                      <SelectItem value={op.id} disabled={disabled}>
                        {op.name} {op.email ? `— ${op.email}` : ""}{" "}
                        <span className="text-warning font-medium">(Booked)</span>
                      </SelectItem>
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent side="left" className="w-64 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">Upcoming Bookings</p>
                    <div className="space-y-1.5">
                      {upcomingBookings.map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{b.date}</span>
                          <span className="text-foreground font-medium truncate ml-2 max-w-[140px]">{b.clientName}</span>
                        </div>
                      ))}
                      {bookings.length > 5 && (
                        <p className="text-[10px] text-muted-foreground">+{bookings.length - 5} more</p>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            }

            return (
              <SelectItem key={op.id} value={op.id} disabled={disabled}>
                {op.name} {op.email ? `— ${op.email}` : ""}
                {op.status === "invited" && <span className="ml-1 text-[11px] text-primary">(Invited)</span>}
              </SelectItem>
            );
          })}
          <div className="sticky bottom-0 -mx-1 -mb-1 mt-1 border-t border-border/60 bg-popover/90 backdrop-blur-xl p-1">
            <SelectItem value="__invite__" className="text-primary font-semibold focus:text-primary">
              + Invite New Operator
            </SelectItem>
          </div>
        </SelectContent>
      </Select>
      <InviteOperatorDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={onSelect} />
    </div>
  );
}

// Sub-component for gear selection with same-day locking
function parseTimeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

function getJobTimeWindow(job: any): { start: number; end: number } {
  const startMin = parseTimeToMinutes(job.call_time || "08:00");
  const hours = parseInt(job.guaranteed_hours || "8", 10) || 8;
  return { start: startMin, end: startMin + hours * 60 };
}

function timeWindowsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function GearSelector({
  allAssets,
  parentAssets,
  selectedAssetIds,
  allAssignments,
  startDate,
  callTime,
  guaranteedHours,
  onAdd,
  onAddMany,
}: {
  allAssets: any[];
  parentAssets: any[];
  selectedAssetIds: string[];
  allAssignments: any[];
  startDate: Date | undefined;
  callTime: string;
  guaranteedHours: string;
  onAdd: (id: string) => void;
  onAddMany: (ids: string[]) => void;
}) {
  const { data: jobs = [] } = useJobs();
  const { kits, lockedAssetIds, kitMemberIds } = useKitIndex();

  const newJobWindow = useMemo(() => {
    const startMin = parseTimeToMinutes(callTime || "08:00");
    const hours = parseInt(guaranteedHours || "8", 10) || 8;
    return { start: startMin, end: startMin + hours * 60 };
  }, [callTime, guaranteedHours]);

  const bookedAssetIds = useMemo(() => {
    if (!startDate) return new Set<string>();
    const dateStr = format(startDate, "yyyy-MM-dd");
    const jobsOnDate = jobs.filter((j: any) => j.job_date === dateStr && j.status !== "cancelled");
    const jobMap = new Map(jobsOnDate.map((j: any) => [j.id, j]));

    const booked = new Set<string>();
    allAssignments.forEach((a: any) => {
      const job = jobMap.get(a.job_id);
      if (!job || !a.asset_ids) return;
      const existingWindow = getJobTimeWindow(job);
      if (timeWindowsOverlap(newJobWindow, existingWindow)) {
        a.asset_ids.forEach((id: string) => booked.add(id));
      }
    });
    return booked;
  }, [startDate, jobs, allAssignments, newJobWindow]);

  const dropdownSource = parentAssets.length > 0
    ? parentAssets
    : allAssets.filter((a) => !a.parent_asset_id);

  const blockedStatuses = ["iffy", "missing", "broken"];

  // Individual parent assets, EXCLUDING parents locked inside a Meemaw kit
  const freeParents = dropdownSource.filter((a) => !lockedAssetIds.has(a.id));

  const selectableAssets = freeParents.filter(
    (a) => !selectedAssetIds.includes(a.id) && !bookedAssetIds.has(a.id) && !blockedStatuses.includes(a.status)
  );
  const bookedOnDateAssets = freeParents.filter(
    (a) => !selectedAssetIds.includes(a.id) && bookedAssetIds.has(a.id) && !blockedStatuses.includes(a.status)
  );
  const blockedAssets = freeParents.filter(
    (a) => !selectedAssetIds.includes(a.id) && blockedStatuses.includes(a.status)
  );

  // Kit availability: a kit is selectable only if every locked member is free + unbooked + not blocked
  type KitRow = { id: string; name: string; emoji: string | null; memberIds: string[]; reason?: string; status: "available" | "partially_selected" | "booked" | "blocked" | "empty" };
  const kitRows: KitRow[] = kits.map((k) => {
    const memberIds = kitMemberIds.get(k.id) ?? [];
    if (memberIds.length === 0) return { id: k.id, name: k.name, emoji: k.emoji, memberIds, status: "empty" };
    const allSelected = memberIds.every((id) => selectedAssetIds.includes(id));
    if (allSelected) return { id: k.id, name: k.name, emoji: k.emoji, memberIds, status: "partially_selected", reason: "Already added" };
    const anyBlocked = memberIds.some((id) => {
      const a = allAssets.find((x) => x.id === id);
      return a && blockedStatuses.includes(a.status);
    });
    if (anyBlocked) return { id: k.id, name: k.name, emoji: k.emoji, memberIds, status: "blocked", reason: "Member needs attention" };
    const anyBooked = memberIds.some((id) => bookedAssetIds.has(id));
    if (anyBooked) return { id: k.id, name: k.name, emoji: k.emoji, memberIds, status: "booked", reason: "Member booked this window" };
    return { id: k.id, name: k.name, emoji: k.emoji, memberIds, status: "available" };
  });

  const availableKits = kitRows.filter((k) => k.status === "available");
  const unavailableKits = kitRows.filter((k) => k.status === "booked" || k.status === "blocked");

  const handleSelect = (val: string) => {
    if (val.startsWith("kit:")) {
      const kitId = val.slice(4);
      const row = kitRows.find((k) => k.id === kitId);
      if (row) onAddMany(row.memberIds);
    } else {
      onAdd(val);
    }
  };

  return (
    <>
      <Select value="" onValueChange={handleSelect}>
        <SelectTrigger className="text-[16px] md:text-sm"><SelectValue placeholder="Select asset or Meemaw kit to add" /></SelectTrigger>
        <SelectContent>
          {availableKits.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                👵 Meemaw Kits — assigns whole bundle
              </div>
              {availableKits.map((k) => (
                <SelectItem key={`kit:${k.id}`} value={`kit:${k.id}`}>
                  {k.emoji ?? "👵"} {k.name} — {k.memberIds.length} pcs
                </SelectItem>
              ))}
            </>
          )}
          {selectableAssets.length > 0 && (
            <>
              {availableKits.length > 0 && (
                <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t mt-1 pt-1.5">
                  Individual Parent Rigs
                </div>
              )}
              {selectableAssets.map((asset) => (
                <SelectItem key={asset.id} value={asset.id}>
                  {asset.asset_name} ({asset.category})
                </SelectItem>
              ))}
            </>
          )}
          {selectableAssets.length === 0 && availableKits.length === 0 && bookedOnDateAssets.length === 0 && unavailableKits.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No parent rigs or kits available to add</div>
          )}
          {(bookedOnDateAssets.length > 0 || unavailableKits.filter((k) => k.status === "booked").length > 0) && (
            <>
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t mt-1 pt-1.5">
                Booked during this time window
              </div>
              {unavailableKits.filter((k) => k.status === "booked").map((k) => (
                <SelectItem key={`kit:${k.id}`} value={`kit:${k.id}`} disabled>
                  {k.emoji ?? "👵"} {k.name} — Kit member booked
                </SelectItem>
              ))}
              {bookedOnDateAssets.map((asset) => (
                <SelectItem key={asset.id} value={asset.id} disabled>
                  {asset.asset_name} ({asset.category}) — Booked
                </SelectItem>
              ))}
            </>
          )}
          {(blockedAssets.length > 0 || unavailableKits.filter((k) => k.status === "blocked").length > 0) && (
            <>
              <div className="px-2 py-1.5 text-[10px] font-semibold text-destructive uppercase tracking-wider border-t mt-1 pt-1.5">
                ⚠️ Unavailable — Needs Attention
              </div>
              {unavailableKits.filter((k) => k.status === "blocked").map((k) => (
                <SelectItem key={`kit:${k.id}`} value={`kit:${k.id}`} disabled>
                  {k.emoji ?? "👵"} {k.name} — Kit member flagged
                </SelectItem>
              ))}
              {blockedAssets.map((asset) => (
                <SelectItem key={asset.id} value={asset.id} disabled>
                  {asset.asset_name} ({asset.category}) — {asset.status?.toUpperCase()}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </>
  );
}

