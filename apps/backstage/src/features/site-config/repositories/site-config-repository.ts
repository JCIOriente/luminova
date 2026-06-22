import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { SiteConfig, SiteConfigInput } from "@luminova/types";
import { toSiteConfigDoc } from "./site-config-mapper";

const DOC_PATH = "current";

export class SiteConfigRepository {
  private readonly ref = doc(getFirebase().db, "siteConfig", DOC_PATH);

  async get(): Promise<SiteConfig | null> {
    const snap = await getDoc(this.ref);
    return snap.exists() ? (snap.data() as SiteConfig) : null;
  }

  async update(data: SiteConfigInput, currentVersion: number): Promise<void> {
    await setDoc(this.ref, toSiteConfigDoc(data, currentVersion), { merge: true });
  }
}
