import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ScanLine, Camera, RotateCcw, Radio, Pencil, PackageCheck, PackageOpen, Plus, Loader2, Bluetooth, BluetoothConnected } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAssignments, useJobs, useUpdateAssetStatus, useUpdateAssignment } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "camera" | "nfc";

interface ScannedAsset {
  id: string;
  asset_name: string | null;
  status: string | null;
  category: string | null;
  color_code: string | null;
  serial_number: string | null;
  quantity: number;
  parent_asset_id: string | null;
}

/** Short success beep via WebAudio — no asset file needed. */
function playBeep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* noop */
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function QRScanner() {
  const { role, employee } = useAuth();
  // RFID / Tag Finder is strictly Admin-only
  const isAdmin = employee?.role === "admin";
  const navigate = useNavigate();
  const { data: assignments = [] } = useAssignments();
  const { data: jobs = [] } = useJobs();
  const updateAssetStatus = useUpdateAssetStatus();
  const updateAssignment = useUpdateAssignment();

  const [mode, setMode] = useState<Mode>("camera");
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [asset, setAsset] = useState<ScannedAsset | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [children, setChildren] = useState<ScannedAsset[]>([]);
  const [nfcActive, setNfcActive] = useState(false);
  const [bluetoothStatus, setBluetoothStatus] = useState<"idle" | "connecting" | "connected" | "unsupported">("idle");
  const [rssi, setRssi] = useState(-100);
  const [bluetoothName, setBluetoothName] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const bluetoothDeviceRef = useRef<any>(null);
  const busyRef = useRef(false);

  const lookup = useCallback(async (raw: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const code = raw.trim();
    setLooking(true);
    setNotFoundCode(null);
    try {
      const cols = "id, asset_name, status, category, color_code, serial_number, quantity, parent_asset_id";
      let found: ScannedAsset | null = null;

      if (code.startsWith("ggasset:") || UUID_RE.test(code)) {
        const id = code.replace("ggasset:", "");
        const { data } = await supabase.from("assets").select(cols).eq("id", id).maybeSingle();
        found = (data as ScannedAsset) ?? null;
      }
      if (!found) {
        const { data } = await supabase.from("assets").select(cols).eq("serial_number", code).limit(1);
        found = ((data as ScannedAsset[]) ?? [])[0] ?? null;
      }
      if (!found) {
        const { data } = await supabase.from("assets").select(cols).ilike("asset_name", code).limit(1);
        found = ((data as ScannedAsset[]) ?? [])[0] ?? null;
      }

      if (found) {
        playBeep();
        // Child asset scanned → open the Parent Kit instead
        if (found.parent_asset_id) {
          const { data: parent } = await supabase
            .from("assets")
            .select(cols)
            .eq("id", found.parent_asset_id)
            .maybeSingle();
          if (parent) {
            toast.info("Child item scanned. Opening Parent Kit…");
            found = parent as ScannedAsset;
          }
        }
        setAsset(found);
        const { data: kids } = await supabase.from("assets").select(cols).eq("parent_asset_id", found.id);
        setChildren((kids as ScannedAsset[]) ?? []);
      } else {
        setAsset(null);
        setChildren([]);
        setNotFoundCode(code);
      }
    } finally {
      setLooking(false);
      busyRef.current = false;
    }
  }, []);

  // ---- Camera (QR + 1D barcode) ----
  useEffect(() => {
    if (mode !== "camera" || !scanning) return;
    let instance: any = null;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        instance = new Html5Qrcode("universal-reader", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          verbose: false,
        } as any);
        scannerRef.current = instance;

        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decoded: string) => {
            if (decoded.startsWith("ggmeemaw:")) {
              const kitId = decoded.replace("ggmeemaw:", "");
              instance.stop().catch(() => {});
              navigate(`/meemaw-kits/${kitId}`);
              return;
            }
            setScanning(false);
            instance.stop().catch(() => {});
            lookup(decoded);
          },
          () => {}
        );
      } catch (err: any) {
        setError(err?.message || "Camera not available");
      }
    })();

    return () => {
      cancelled = true;
      instance?.stop?.().catch(() => {});
    };
  }, [mode, scanning, lookup, navigate]);

  // ---- NFC / RFID ----
  useEffect(() => {
    if (mode !== "nfc" || !scanning || !isAdmin) return;
    const NDEF = (window as any).NDEFReader;
    if (!NDEF) {
      setNfcActive(false);
      return;
    }
    let reader: any;
    const controller = new AbortController();
    (async () => {
      try {
        reader = new NDEF();
        await reader.scan({ signal: controller.signal });
        setNfcActive(true);
        reader.onreading = (event: any) => {
          let payload = event.serialNumber || "";
          for (const record of event.message?.records ?? []) {
            try {
              payload = new TextDecoder(record.encoding || "utf-8").decode(record.data) || payload;
            } catch {
              /* noop */
            }
          }
          if (payload) {
            setScanning(false);
            lookup(payload);
          }
        };
      } catch {
        setNfcActive(false);
      }
    })();
    return () => controller.abort();
  }, [mode, scanning, lookup, isAdmin]);

  // Non-admins can never sit in RFID mode
  useEffect(() => {
    if (mode === "nfc" && !isAdmin) setMode("camera");
  }, [mode, isAdmin]);

  useEffect(() => () => {
    bluetoothDeviceRef.current?.gatt?.disconnect?.();
  }, []);

  const connectBluetoothScanner = async () => {
    if (!isAdmin) return;
    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth) {
      setBluetoothStatus("unsupported");
      toast.error("Web Bluetooth is not available in this browser.");
      return;
    }
    setBluetoothStatus("connecting");
    try {
      const device = await bluetooth.requestDevice({ acceptAllDevices: true });
      bluetoothDeviceRef.current = device;
      setBluetoothName(device.name || "RFID Scanner");
      await device.gatt?.connect?.();
      device.addEventListener?.("advertisementreceived", (event: any) => {
        if (typeof event.rssi === "number") setRssi(event.rssi);
      });
      if (device.watchAdvertisements) await device.watchAdvertisements();
      setBluetoothStatus("connected");
      toast.success("Bluetooth scanner connected");
    } catch (err: any) {
      setBluetoothStatus("idle");
      if (err?.name !== "NotFoundError") toast.error(err?.message || "Bluetooth connection failed");
    }
  };

  const reset = () => {
    setAsset(null);
    setChildren([]);
    setNotFoundCode(null);
    setError(null);
    setScanning(true);
  };

  const switchMode = (m: Mode) => {
    if (m === "nfc" && !isAdmin) return;
    scannerRef.current?.stop?.().catch(() => {});
    setMode(m);
    reset();
  };

  // Operator's current job (today's assignment) for "Add to Current Job"
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentAssignment = employee
    ? assignments.find((a) => {
        const job = jobs.find((j) => j.id === a.job_id);
        return a.operator_id === employee.id && job?.job_date === todayIso;
      })
    : undefined;
  const currentJob = currentAssignment ? jobs.find((j) => j.id === currentAssignment.job_id) : undefined;

  const setStatus = async (status: string) => {
    if (!asset) return;
    await updateAssetStatus.mutateAsync({ id: asset.id, status });
    setAsset({ ...asset, status });
    toast.success(status === "available" ? "Checked in" : "Checked out");
  };

  const addToCurrentJob = async () => {
    if (!asset || !currentAssignment) return;
    if (currentAssignment.asset_ids?.includes(asset.id)) {
      toast.info("Already on this job's loadout.");
      return;
    }
    await updateAssignment.mutateAsync({
      id: currentAssignment.id,
      asset_ids: [...(currentAssignment.asset_ids ?? []), asset.id],
    });
    toast.success(`Added to ${currentJob?.client_name ?? "current job"}`);
  };

  return (
    <div className="min-h-full bg-background px-4 py-5 md:px-8 md:py-7">
      <div className="mx-auto max-w-4xl space-y-5">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3">
        <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-primary/15 glow-primary">
          <ScanLine className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scanner</h1>
          <p className="text-sm text-muted-foreground">Scan gear, kits, and tracking tags</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-foreground/5 p-1 backdrop-blur-xl">
        <Button
          variant={mode === "camera" ? "default" : "ghost"}
          className="min-h-12 rounded-xl"
          onClick={() => switchMode("camera")}
        >
          <Camera className="h-4 w-4" /> Camera (QR/Barcode)
        </Button>
        {isAdmin && (
          <Button
            variant={mode === "nfc" ? "default" : "ghost"}
            className="min-h-12 rounded-xl"
            onClick={() => switchMode("nfc")}
          >
            <Radio className="h-4 w-4" /> RFID Locator
          </Button>
        )}
      </div>

      {/* Scan surface */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/40 shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.45)]">
        {mode === "camera" ? (
          <div className="relative min-h-[340px]">
            <div id="universal-reader" className="w-full min-h-[340px] [&_video]:object-cover" />
            {/* glowing scan box overlay */}
            {scanning && !error && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />
                <div className="relative h-[240px] w-[240px] rounded-3xl border-2 border-primary/70 shadow-[0_0_40px_hsl(var(--primary)/0.5),inset_0_0_40px_hsl(var(--primary)/0.15)]">
                  <motion.div
                    className="absolute left-2 right-2 h-[2px] rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]"
                    animate={{ top: ["8%", "92%", "8%"] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-[430px] flex flex-col items-center justify-center gap-5 p-8 text-center">
            <div className="relative flex h-52 w-52 items-center justify-center rounded-full border border-primary/30 bg-primary/5 shadow-[0_0_70px_hsl(var(--primary)/0.25)]">
              {[1, 0.76, 0.5].map((scale, index) => (
                <motion.span key={scale} className="absolute inset-0 rounded-full border border-primary/20" style={{ scale }} animate={{ opacity: [0.25, 0.75, 0.25] }} transition={{ duration: 2, delay: index * 0.2, repeat: Infinity }} />
              ))}
              <div>
                <Radio className="mx-auto h-9 w-9 text-primary" />
                <p className="mt-2 text-3xl font-bold text-foreground">{bluetoothStatus === "connected" ? rssi : "—"}</p>
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">dBm signal</p>
              </div>
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{bluetoothStatus === "connected" ? bluetoothName : "RFID Tag Finder"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Move around and watch the signal rise as you approach the tag.</p>
            </div>
            <Button className="min-h-[52px] rounded-full px-7" onClick={connectBluetoothScanner} disabled={bluetoothStatus === "connecting" || bluetoothStatus === "connected"}>
              {bluetoothStatus === "connecting" ? <Loader2 className="animate-spin" /> : bluetoothStatus === "connected" ? <BluetoothConnected /> : <Bluetooth />}
              {bluetoothStatus === "connecting" ? "Connecting…" : bluetoothStatus === "connected" ? "Scanner Connected" : "Connect to Bluetooth Scanner"}
            </Button>
            {nfcActive && <p className="text-xs text-success">NFC reader is also active</p>}
          </div>
        )}
      </div>

      {looking && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Looking up asset…
        </div>
      )}

      {/* Result sheet */}
      <AnimatePresence>
        {asset && !scanning && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="space-y-4"
          >
            <Card className="rounded-[1.75rem] border-white/10 bg-white/10 backdrop-blur-xl shadow-[0_20px_60px_-25px_hsl(var(--primary)/0.5)]">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: asset.color_code ?? undefined }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-bold text-foreground">{asset.asset_name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {asset.category && <Badge variant="outline" className="rounded-full text-xs">{asset.category}</Badge>}
                      <Badge variant="outline" className="rounded-full text-xs">{(asset.status ?? "").replace(/_/g, " ")}</Badge>
                      <Badge variant="outline" className="rounded-full text-xs">Qty {asset.quantity}</Badge>
                      {asset.serial_number && (
                        <span className="text-xs text-muted-foreground font-mono">{asset.serial_number}</span>
                      )}
                    </div>
                  </div>
                </div>

                {children.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kit Contents</p>
                    {children.map((child) => (
                      <div key={child.id} className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: child.color_code ?? undefined }} />
                        <span className="text-sm text-foreground flex-1">{child.asset_name}</span>
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          {(child.status ?? "").replace(/_/g, " ")}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-2">
                  <Button
                    className="w-full gap-2 rounded-full py-3.5"
                    onClick={() => setStatus("checked_out")}
                    disabled={updateAssetStatus.isPending || asset.status === "checked_out"}
                  >
                    <PackageOpen className="h-4 w-4" /> Check Out
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full gap-2 rounded-full py-3.5"
                    onClick={() => setStatus("available")}
                    disabled={updateAssetStatus.isPending || asset.status === "available"}
                  >
                    <PackageCheck className="h-4 w-4" /> Check In
                  </Button>
                  {currentAssignment && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 rounded-full py-3.5"
                      onClick={addToCurrentJob}
                      disabled={updateAssignment.isPending}
                    >
                      <Plus className="h-4 w-4" /> Add to {currentJob?.client_name ?? "Current Job"}
                    </Button>
                  )}
                  {role === "manager" && (
                    <Button variant="ghost" className="w-full gap-2 rounded-full" onClick={() => navigate("/assets")}>
                      <Pencil className="h-4 w-4" /> Edit Asset
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button onClick={reset} variant="outline" className="w-full gap-2 rounded-full">
              <RotateCcw className="h-4 w-4" /> Scan Again
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {notFoundCode && !scanning && (
        <Card className="rounded-[1.75rem] border-destructive/30 bg-white/5 backdrop-blur-xl">
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-destructive">
              No asset matched <span className="font-mono">{notFoundCode}</span>.
            </p>
            <Button onClick={reset} variant="outline" className="gap-2 rounded-full">
              <RotateCcw className="h-4 w-4" /> Scan Again
            </Button>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
