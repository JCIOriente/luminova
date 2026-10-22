import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BrandConfigError } from "./load-profile.ts";

export const SITE_CONTENT_FILE = "site-content.json";

// The seeds own these keys; hero and linktree are left to /config so a re-seed keeps edits.
export const SEEDED_SITE_CONTENT_KEYS = ["stats", "timeline", "mvv", "reasons", "contact"] as const;

type SeededKey = (typeof SEEDED_SITE_CONTENT_KEYS)[number];

/** The raw `site-content.json` of a profile; the build validates it (site-content-schema.ts). */
export function readSiteContent(profileDir: string, slug: string): Record<string, unknown> {
  const file = join(profileDir, SITE_CONTENT_FILE);
  const label = `brand/${slug}/${SITE_CONTENT_FILE}`;
  if (!existsSync(file)) {
    throw new BrandConfigError([`${label}: missing (copy it from brand/jci-oriente/ and edit it)`]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new BrandConfigError([
      `${label}: not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    ]);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new BrandConfigError([`${label}: must be a JSON object`]);
  }
  return { ...raw };
}

export function pickSeededSiteContent(
  content: Record<string, unknown>,
): Record<SeededKey, unknown> {
  const { stats, timeline, mvv, reasons, contact } = content;
  return { stats, timeline, mvv, reasons, contact };
}
