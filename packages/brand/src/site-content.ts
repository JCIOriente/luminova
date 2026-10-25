import { existsSync } from "node:fs";
import { join } from "node:path";
import { BrandConfigError, readJsonFile } from "./load-profile.ts";
import type { Remedy } from "./remedy.ts";

export const SITE_CONTENT_FILE = "site-content.json";

// The seeds own these keys; hero and linktree are left to /config so a re-seed keeps edits.
export const SEEDED_SITE_CONTENT_KEYS = ["stats", "timeline", "mvv", "reasons", "contact"] as const;

type SeededKey = (typeof SEEDED_SITE_CONTENT_KEYS)[number];

const EXAMPLE = `brand/jci-oriente/${SITE_CONTENT_FILE}`;

/** Edit the profile's site content, with the example as the reference for every field. */
export const editSiteContent = (slug: string): Remedy => ({
  change: `edit the fields above in brand/${slug}/${SITE_CONTENT_FILE} (${EXAMPLE} shows each one)`,
  run: "pnpm brand:check",
});

/** The raw `site-content.json` of a profile; the build validates it (site-content-schema.ts). */
export function readSiteContent(profileDir: string, slug: string): Record<string, unknown> {
  const file = join(profileDir, SITE_CONTENT_FILE);
  const label = `brand/${slug}/${SITE_CONTENT_FILE}`;
  if (!existsSync(file)) {
    throw new BrandConfigError(
      [`${label}: missing (copy it from brand/jci-oriente/ and edit it)`],
      [{ change: `copy the example, then edit it`, run: `cp ${EXAMPLE} ${label}` }],
    );
  }
  const raw = readJsonFile(file, label);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new BrandConfigError([`${label}: must be a JSON object`], [editSiteContent(slug)]);
  }
  return { ...raw };
}

/** Throws before any write: Firestore rejects an undefined field mid-seed. */
export function pickSeededSiteContent(
  content: Record<string, unknown>,
  slug: string,
): Record<SeededKey, unknown> {
  const missing = SEEDED_SITE_CONTENT_KEYS.filter((key) => content[key] === undefined);
  if (missing.length > 0) {
    throw new BrandConfigError(
      missing.map((key) => `brand/${slug}/${SITE_CONTENT_FILE} ${key}: missing`),
      [editSiteContent(slug)],
    );
  }
  const { stats, timeline, mvv, reasons, contact } = content;
  return { stats, timeline, mvv, reasons, contact };
}
