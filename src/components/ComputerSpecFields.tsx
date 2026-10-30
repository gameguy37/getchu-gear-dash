import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ComputerSpec } from "@/lib/types";

const MACBOOK_MODELS = [
  "MacBook Pro 13\" (2012)",
  "MacBook Pro 15\" (2012)",
  "MacBook Pro 13\" (2013)",
  "MacBook Pro 15\" (2013)",
  "MacBook Pro 13\" (2014)",
  "MacBook Pro 15\" (2014)",
  "MacBook Pro 13\" (2015)",
  "MacBook Pro 15\" (2015)",
  "MacBook Pro 13\" (2016)",
  "MacBook Pro 15\" (2016)",
  "MacBook Pro 13\" (2017)",
  "MacBook Pro 15\" (2017)",
  "MacBook Pro 13\" (2018)",
  "MacBook Pro 15\" (2018)",
  "MacBook Pro 13\" (2019)",
  "MacBook Pro 16\" (2019)",
  "MacBook Pro 13\" (2020)",
  "MacBook Air M1",
  "MacBook Air M2",
  "MacBook Air M3",
  "MacBook Pro 14\" M1 Pro",
  "MacBook Pro 14\" M2 Pro",
  "MacBook Pro 14\" M3 Pro",
  "MacBook Pro 14\" M4 Pro",
  "MacBook Pro 16\" M1 Pro/Max",
  "MacBook Pro 16\" M2 Pro/Max",
  "MacBook Pro 16\" M3 Pro/Max",
  "MacBook Pro 16\" M4 Pro/Max",
];

const YEARS = ["2012", "2013", "2014", "2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];

interface ComputerSpecFieldsProps {
  spec: ComputerSpec;
  onChange: (spec: ComputerSpec) => void;
  compact?: boolean;
}

export function ComputerSpecFields({ spec, onChange, compact = false }: ComputerSpecFieldsProps) {
  const update = (patch: Partial<ComputerSpec>) => onChange({ ...spec, ...patch });
  const labelCls = compact ? "text-xs text-muted-foreground" : "text-[16px] md:text-sm";
  const inputCls = compact ? "text-[16px] md:text-sm h-8" : "text-[16px] md:text-sm";

  return (
    <div className="space-y-3">
      <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3"}>
        <div className="space-y-1">
          <Label className={labelCls}>Login Name</Label>
          <Input
            className={inputCls}
            value={spec.login_name ?? ""}
            onChange={(e) => update({ login_name: e.target.value })}
            placeholder="e.g. OP-MacBook-01"
          />
        </div>
        <div className="space-y-1">
          <Label className={labelCls}>MacBook Type</Label>
          <Select value={spec.macbook_type ?? ""} onValueChange={(v) => update({ macbook_type: v })}>
            <SelectTrigger className={inputCls}><SelectValue placeholder="Select model..." /></SelectTrigger>
            <SelectContent>
              {MACBOOK_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className={labelCls}>Year</Label>
          <Select value={spec.year ?? ""} onValueChange={(v) => update({ year: v })}>
            <SelectTrigger className={inputCls}><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className={labelCls}>Current OS Version</Label>
          <Input
            className={inputCls}
            value={spec.os_version ?? ""}
            onChange={(e) => update({ os_version: e.target.value })}
            placeholder="e.g. macOS 16.3"
          />
        </div>
        <div className="space-y-1">
          <Label className={labelCls}>Last OS Update Date</Label>
          <Input
            type="date"
            className={inputCls}
            value={spec.last_os_update ?? ""}
            onChange={(e) => update({ last_os_update: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className={labelCls}>Prompter Version</Label>
          <Input
            className={inputCls}
            value={spec.prompter_version ?? ""}
            onChange={(e) => update({ prompter_version: e.target.value })}
            placeholder="e.g. v4.2.1"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className={labelCls}>Desktop Background URL</Label>
        <Input
          className={inputCls}
          value={spec.desktop_background_url ?? ""}
          onChange={(e) => update({ desktop_background_url: e.target.value })}
          placeholder="https://..."
        />
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={spec.ms_word_installed ?? false}
            onCheckedChange={(v) => update({ ms_word_installed: v })}
          />
          <Label className={labelCls}>MS Word</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={spec.remote_desktop_installed ?? false}
            onCheckedChange={(v) => update({ remote_desktop_installed: v })}
          />
          <Label className={labelCls}>Remote Desktop</Label>
        </div>
      </div>
    </div>
  );
}
