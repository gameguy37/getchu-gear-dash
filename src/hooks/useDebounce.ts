import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stopped changing for `delay` ms.
 * Used for background autosave so we only hit the database once the user pauses typing.
 */
export function useDebounce<T>(value: T, delay = 700): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

export default useDebounce;
