import type { SiteConfig } from "@luminova/types";
import { foundedYear } from "virtual:luminova-brand";
import { siteContent } from "virtual:luminova-brand/site-content";

export const SITE_CONFIG_DEFAULTS: Omit<SiteConfig, "version" | "updatedAt"> = siteContent;

export function currentYearsActive(now = new Date()): number {
  return now.getFullYear() - foundedYear;
}
