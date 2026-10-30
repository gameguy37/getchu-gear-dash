import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Address autocomplete using server-side Google Maps proxy.
 * Add GOOGLE_MAPS_API_KEY as a Supabase Edge Function secret in the dashboard.
 */

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  className?: string;
}

interface Prediction {
  description: string;
  place_id: string;
}

export function AddressAutocomplete({ value, onChange, placeholder = "Enter address...", className }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 3) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("maps-proxy", {
        body: { input },
      });
      if (!error && data?.predictions) {
        setSuggestions(data.predictions.slice(0, 5));
        setShowDropdown(true);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = (desc: string) => {
    onChange(desc);
    setShowDropdown(false);
    setSuggestions([]);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
      <Input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        placeholder={placeholder}
        className={`pl-9 text-[16px] md:text-sm ${className ?? ""}`}
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-[99999] mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.place_id}
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
              onClick={() => handleSelect(s.description)}
            >
              {s.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
