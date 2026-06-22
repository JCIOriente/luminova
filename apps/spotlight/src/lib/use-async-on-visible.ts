import { useCallback, useEffect, useRef, useState } from "react";
import type { DependencyList } from "react";
import type { Async } from "./use-async";

export type AsyncOnVisible<T> = Async<T> & { ref: (node: Element | null) => void };

/**
 * Defers a one-shot public read until the observed element first scrolls into view.
 * Mirrors useAsync's empty+loading-first contract, but holds loading:true with no
 * fetch until the IntersectionObserver fires once, then disconnects.
 */
export function useAsyncOnVisible<T>(
  fetcher: () => Promise<T>,
  empty: T,
  deps: DependencyList,
): AsyncOnVisible<T> {
  const [state, setState] = useState<Async<T>>({ data: empty, loading: true, error: false });
  const [visible, setVisible] = useState(false);

  const fetcherRef = useRef(fetcher);
  const emptyRef = useRef(empty);
  fetcherRef.current = fetcher;
  emptyRef.current = empty;

  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback((node: Element | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        observerRef.current = null;
        setVisible(true);
      }
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, ...deps]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ...state, ref };
}
