import { useEffect, useRef, useState } from "react";
import type { DependencyList } from "react";
import type { ShowcaseItem } from "@luminova/types/engine";
import { fetchShowcaseItem, fetchShowcaseList } from "./showcase-firestore";

type Async<T> = { data: T; loading: boolean; error: boolean };

function useAsync<T>(fetcher: () => Promise<T>, empty: T, deps: DependencyList): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: empty, loading: true, error: false });
  const fetcherRef = useRef(fetcher);
  const emptyRef = useRef(empty);
  fetcherRef.current = fetcher;
  emptyRef.current = empty;

  useEffect(() => {
    let alive = true;
    const e = emptyRef.current;
    setState({ data: e, loading: true, error: false });
    fetcherRef
      .current()
      .then((data) => {
        if (alive) setState({ data, loading: false, error: false });
      })
      .catch(() => {
        if (alive) setState({ data: emptyRef.current, loading: false, error: true });
      });
    return () => {
      alive = false;
    };
  }, deps);
  return state;
}

export function useShowcaseList(): Async<ShowcaseItem[]> {
  return useAsync(fetchShowcaseList, [] as ShowcaseItem[], []);
}

export function useShowcaseItem(id: string): Async<ShowcaseItem | null> {
  return useAsync(() => fetchShowcaseItem(id), null as ShowcaseItem | null, [id]);
}
