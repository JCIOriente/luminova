import { z } from "zod";
import { LINKTREE_ICONS, LINKTREE_SOCIAL_PLATFORMS } from "./site-config.js";

const reqText = z.string().min(1, "Requerido.");
const intMin0 = z.number({ error: "Ingresa un número" }).int().min(0, "Mínimo 0");
// Block javascript:/data: and other script-bearing schemes from public <a href>.
// Allow http(s), mailto (linktree contact links), and the "#" placeholder.
const safeUrl = reqText.refine((v) => v === "#" || /^(https?:\/\/|mailto:)/i.test(v), {
  message: "Usa una URL http(s), mailto: o «#».",
});

// Socials may be left blank (the public page simply omits an empty one), so allow "".
const optionalSafeUrl = z
  .string()
  .refine((v) => v === "" || v === "#" || /^(https?:\/\/|mailto:)/i.test(v), {
    message: "Usa una URL http(s), mailto: o «#».",
  });

const linktreeSchema = z.object({
  handle: reqText,
  tagline: reqText,
  taglineAccent: z.string(),
  links: z.array(
    z.object({
      id: reqText,
      icon: z.enum(LINKTREE_ICONS),
      title: reqText,
      description: z.string(),
      url: safeUrl,
      isPrimary: z.boolean(),
      badge: z.string().optional(),
      active: z.boolean(),
    }),
  ),
  socials: z.array(
    z.object({
      platform: z.enum(LINKTREE_SOCIAL_PLATFORMS),
      url: optionalSafeUrl,
    }),
  ),
});

export const siteConfigSchema = z.object({
  stats: z.object({
    programCount: intMin0,
    countries: reqText,
    membersWorldwide: reqText,
    nationalAwards: intMin0,
    efficiencyPct: z
      .number({ error: "Ingresa un número" })
      .min(0, "Mínimo 0")
      .max(100, "Máximo 100"),
    standoutOrg: z.object({ year: reqText, title: reqText }),
  }),
  timeline: z.array(z.object({ year: reqText, title: reqText, description: z.string() })),
  mvv: z.object({ mision: reqText, vision: reqText, valores: reqText }),
  reasons: z.array(z.object({ number: z.string(), title: reqText, body: z.string() })),
  contact: z.object({
    email: z.string().email("Correo no válido"),
    location: reqText,
    meetingSchedule: reqText,
    links: z.array(z.object({ label: reqText, url: safeUrl })),
  }),
  linktree: linktreeSchema,
});

export type SiteConfigInput = z.infer<typeof siteConfigSchema>;
