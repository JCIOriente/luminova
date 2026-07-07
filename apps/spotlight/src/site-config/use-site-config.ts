import { useEffect, useState } from "react";
import type { SiteConfig } from "@luminova/types";
import { fetchSiteConfig } from "./site-config-firestore";
import { SITE_CONFIG_DEFAULTS } from "./defaults";
import { makeResourceCache, dedupe } from "../lib/cached-resource";

export const CACHE_KEY = "jci.siteConfig.v1";

type Resolved = Omit<SiteConfig, "version" | "updatedAt">;

// A cached blob or a Firestore doc may predate newer fields (hero,
// contact.socials, contact.mapUrl). Backfill every missing field from the
// defaults so consumers can read e.g. config.hero.motto without guards.
function withDefaults(c: Partial<Resolved> | null | undefined): Resolved {
  return {
    ...SITE_CONFIG_DEFAULTS,
    ...c,
    hero: c?.hero ?? SITE_CONFIG_DEFAULTS.hero,
    contact: { ...SITE_CONFIG_DEFAULTS.contact, ...c?.contact },
    linktree: c?.linktree ?? SITE_CONFIG_DEFAULTS.linktree,
  };
}

const cache = makeResourceCache<Resolved>({
  key: CACHE_KEY,
  revive: (raw) => withDefaults(raw as Partial<Resolved>),
});

export function readCache(): Resolved | null {
  return cache.read();
}

export function writeCache(config: Resolved): void {
  cache.write(config);
}

// Collapse the concurrent mounts on a page (the hook is called once per section)
// into a single Firestore read + a single cache write, shared across instances.
const revalidateOnce = dedupe(async (): Promise<Resolved | null> => {
  try {
    const fresh = await fetchSiteConfig();
    if (!fresh) return null;
    const resolved = withDefaults({
      hero: fresh.hero,
      stats: fresh.stats,
      timeline: fresh.timeline,
      mvv: fresh.mvv,
      reasons: fresh.reasons,
      contact: fresh.contact,
      linktree: fresh.linktree,
    });
    writeCache(resolved);
    return resolved;
  } catch {
    return null;
  }
});

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
