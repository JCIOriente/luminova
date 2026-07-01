import { useEffect, useState } from "react";

/** Route-local toast state that auto-clears after `ms`. Backstage keeps toast
 *  orchestration at the consumer (no global provider — see the `Toast` component);
 *  this collapses the repeated `useState` + `setTimeout` block into one hook. */
export function useDismissingToast<T = string>(ms = 2800): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (value === null) return;
    const id = setTimeout(() => setValue(null), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return [value, setValue];
}
