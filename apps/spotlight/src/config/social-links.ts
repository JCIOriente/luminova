import type { ReactNode } from "react";
import { Icon } from "@luminova/ui";
import type { SiteSocials } from "@luminova/types";

export interface SocialLink {
  key: keyof SiteSocials;
  label: string;
  Glyph: (p: { s?: number }) => ReactNode;
}

export const SOCIAL_LINKS: SocialLink[] = [
  { key: "facebook", label: "Facebook", Glyph: Icon.facebook },
  { key: "instagram", label: "Instagram", Glyph: Icon.instagram },
  { key: "tiktok", label: "TikTok", Glyph: Icon.tiktok },
  { key: "linkedin", label: "LinkedIn", Glyph: Icon.linkedin },
];
