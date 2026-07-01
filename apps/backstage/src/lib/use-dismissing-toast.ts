import { useCallback, useEffect, useState } from "react";

/** Route-local toast state that auto-clears after `ms`. Backstage keeps toast
 *  orchestration at the consumer (no global provider — see the `Toast` component);
 *  this collapses the repeated `useState` + `setTimeout` block into one hook.
 *
 *  The value is boxed in a fresh object per show() so that showing the SAME message
 *  twice still yields a new state identity — otherwise React bails on the equal
 *  update, the effect never re-runs, and the second toast keeps the first's
 *  already-running (shorter) timer. */
export function useDismissingToast<T = string>(ms = 2800): [T | null, (value: T) => void] {
  const [box, setBox] = useState<{ value: T } | null>(null);
  useEffect(() => {
    if (box === null) return;
    const id = setTimeout(() => setBox(null), ms);
    return () => clearTimeout(id);
  }, [box, ms]);
  const show = useCallback((value: T) => setBox({ value }), []);
  return [box ? box.value : null, show];
}
