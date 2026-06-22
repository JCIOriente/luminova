import { serverTimestamp } from "firebase/firestore";
import {
  LINKTREE_SOCIAL_PLATFORMS,
  type SiteConfig,
  type SiteConfigInput,
  type SiteLinktree,
} from "@luminova/types";

export const EMPTY_LINKTREE: SiteLinktree = {
  handle: "",
  tagline: "",
  taglineAccent: "",
  links: [],
  socials: LINKTREE_SOCIAL_PLATFORMS.map((platform) => ({ platform, url: "" })),
};

// Force socials to exactly the three platforms, in canonical order, so the
// fixed form rows always have a value to bind regardless of stored shape.
function normalizeSocials(stored: SiteLinktree["socials"]): SiteLinktree["socials"] {
  return LINKTREE_SOCIAL_PLATFORMS.map((platform) => ({
    platform,
    url: stored.find((s) => s.platform === platform)?.url ?? "",
  }));
}

function normalizeLinktree(stored: SiteLinktree | undefined): SiteLinktree {
  if (!stored) return EMPTY_LINKTREE;
  return {
    ...stored,
    links: stored.links.map((link) => ({
      ...link,
      id: link.id || crypto.randomUUID(),
    })),
    socials: normalizeSocials(stored.socials),
  };
}

export function toSiteConfigDoc(data: SiteConfigInput, currentVersion: number) {
  return {
    version: currentVersion + 1,
    updatedAt: serverTimestamp(),
    hero: data.hero,
    stats: data.stats,
    timeline: data.timeline,
    mvv: data.mvv,
    reasons: data.reasons,
    contact: data.contact,
    linktree: data.linktree,
  };
}

export function toSiteConfigInput(doc: SiteConfig): SiteConfigInput {
  return {
    hero: doc.hero ?? { motto: "", submotto: "" },
    stats: doc.stats,
    timeline: doc.timeline,
    mvv: doc.mvv,
    reasons: doc.reasons,
    contact: doc.contact,
    linktree: normalizeLinktree(doc.linktree),
  };
}
