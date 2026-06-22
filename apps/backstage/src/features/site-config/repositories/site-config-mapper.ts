import { serverTimestamp } from "firebase/firestore";
import type { SiteConfig, SiteConfigInput } from "@luminova/types";

export function toSiteConfigDoc(data: SiteConfigInput, currentVersion: number) {
  return {
    version: currentVersion + 1,
    updatedAt: serverTimestamp(),
    stats: data.stats,
    timeline: data.timeline,
    mvv: data.mvv,
    reasons: data.reasons,
    contact: data.contact,
  };
}

export function toSiteConfigInput(doc: SiteConfig): SiteConfigInput {
  return {
    stats: doc.stats,
    timeline: doc.timeline,
    mvv: doc.mvv,
    reasons: doc.reasons,
    contact: doc.contact,
  };
}
