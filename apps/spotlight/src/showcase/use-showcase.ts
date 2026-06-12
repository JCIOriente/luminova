import { useEffect, useState } from "react";
import type { ShowcaseItem } from "@luminova/types/engine";
import { fetchShowcaseItem, fetchShowcaseList } from "./showcase-firestore";

type Async<T> = { data: T; loading: boolean; error: boolean };

export function useShowcaseList(): Async<ShowcaseItem[]> {
  const [state, setState] = useState<Async<ShowcaseItem[]>>({ data: [], loading: true, error: false });
  useEffect(() => {
    let alive = true;
    fetchShowcaseList()
      .then((data) => alive && setState({ data, loading: false, error: false }))
      .catch(() => alive && setState({ data: [], loading: false, error: true }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function useShowcaseItem(id: string): Async<ShowcaseItem | null> {
  const [state, setState] = useState<Async<ShowcaseItem | null>>({ data: null, loading: true, error: false });
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: false });
    fetchShowcaseItem(id)
      .then((data) => alive && setState({ data, loading: false, error: false }))
      .catch(() => alive && setState({ data: null, loading: false, error: true }));
    return () => {
      alive = false;
    };
  }, [id]);
  return state;
}
