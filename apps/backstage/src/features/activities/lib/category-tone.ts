import type { ActivityCategory } from "@luminova/types";

export type CoverTone = "blue" | "teal" | "navy";

/** Decorative cover tone per category — drives the card cover bg + ripple color.
 *  Purely visual; carries no domain meaning. */
export const CATEGORY_TONE: Record<ActivityCategory, CoverTone> = {
  Assembly: "navy",
  Course: "teal",
  Anniversary: "blue",
  TM: "teal",
  NationalEvent: "navy",
  ProjectExecution: "blue",
};

export const TONE_COVER_BG: Record<CoverTone, string> = {
  blue: "bg-jci-blue/10",
  teal: "bg-jci-teal/15",
  navy: "bg-jci-navy/10",
};

export const TONE_RIPPLE_COLOR: Record<CoverTone, string> = {
  blue: "var(--color-jci-blue)",
  teal: "var(--color-jci-teal)",
  navy: "var(--color-jci-navy)",
};
