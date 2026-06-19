import { useEffect, useState } from "react";
import type { SiteConfig } from "@luminova/types";
import { fetchSiteConfig } from "./site-config-firestore";
import { SITE_CONFIG_DEFAULTS } from "./defaults";

export const CACHE_KEY = "jci.siteConfig.v1";

type Resolved = Omit<SiteConfig, "version" | "updatedAt">;

export function readCache(): Resolved | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Resolved) : null;
  } catch {
    return null;
  }
}

export function writeCache(config: Resolved): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch {
    /* quota / private mode — ignore, fall back to network each load */
  }
}

// Collapse the concurrent mounts on a page (the hook is called once per section)
// into a single Firestore read + a single cache write, shared across instances.
let inflight: Promise<Resolved | null> | null = null;

function revalidateOnce(): Promise<Resolved | null> {
  inflight ??= fetchSiteConfig()
    .then((fresh) => {
      if (!fresh) return null;
      // Typed literal: adding a required field to Resolved fails compilation here.
      const resolved: Resolved = {
        stats: fresh.stats,
        allies: fresh.allies,
        timeline: fresh.timeline,
        mvv: fresh.mvv,
        reasons: fresh.reasons,
        contact: fresh.contact,
      };
      writeCache(resolved);
      return resolved;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useSiteConfig(): Resolved {
  const [config, setConfig] = useState<Resolved>(() => readCache() ?? SITE_CONFIG_DEFAULTS);

  useEffect(() => {
    let alive = true;
    revalidateOnce().then((resolved) => {
      if (alive && resolved) setConfig(resolved);
    });
    return () => {
      alive = false;
    };
  }, []);

  return config;
}
