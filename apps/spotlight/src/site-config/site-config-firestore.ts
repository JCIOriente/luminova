import { doc, getDoc } from "firebase/firestore/lite";
import { getFirestoreLite } from "@luminova/firebase/lite";
import type { SiteConfig } from "@luminova/types";

export async function fetchSiteConfig(): Promise<SiteConfig | null> {
  const db = getFirestoreLite();
  const snap = await getDoc(doc(db, "siteConfig", "current"));
  return snap.exists() ? (snap.data() as SiteConfig) : null;
}
