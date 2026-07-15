import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@luminova/firebase/db";
import { siteConfigDocSchema, type SiteConfig, type SiteConfigInput } from "@luminova/types";
import { toSiteConfigDoc } from "./site-config-mapper";
import { parseDocData } from "../../../lib/firestore-read";

const DOC_PATH = "current";

export class SiteConfigRepository {
  private readonly ref = doc(getDb(), "siteConfig", DOC_PATH);

  async get(): Promise<SiteConfig | null> {
    const snap = await getDoc(this.ref);
    return snap.exists() ? parseDocData(siteConfigDocSchema, snap) : null;
  }

  async update(data: SiteConfigInput, currentVersion: number): Promise<void> {
    await setDoc(this.ref, toSiteConfigDoc(data, currentVersion), { merge: true });
  }
}
