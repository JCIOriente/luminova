import { serverTimestamp } from "firebase/firestore";
import type { SiteConfig, SiteConfigInput } from "@luminova/types";

export function toSiteConfigDoc(data: SiteConfigInput, currentVersion: number) {
  return {
    version: currentVersion + 1,
    updatedAt: serverTimestamp(),
    stats: data.stats,
    allies: data.allies.map((a) => a.nombre),
    timeline: data.timeline,
    mvv: data.mvv,
    reasons: data.reasons,
    contact: data.contact,
  };
}

export function toSiteConfigInput(doc: SiteConfig): SiteConfigInput {
  return {
    stats: doc.stats,
    allies: doc.allies.map((nombre) => ({ nombre })),
    timeline: doc.timeline,
    mvv: doc.mvv,
    reasons: doc.reasons,
    contact: doc.contact,
  };
}
