import { useEffect, useRef, useState } from "react";
import type { AllyShowcaseItem } from "@luminova/types/engine";
import { fetchAllies } from "./ally-showcase-firestore";

type Async<T> = { data: T; loading: boolean; error: boolean };

export function useAllies(): Async<AllyShowcaseItem[]> {
  const [state, setState] = useState<Async<AllyShowcaseItem[]>>({
    data: [],
    loading: true,
    error: false,
  });
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let alive = true;
    fetchAllies()
      .then((data) => alive && setState({ data, loading: false, error: false }))
      .catch(() => alive && setState({ data: [], loading: false, error: true }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
