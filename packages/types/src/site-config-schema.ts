import { z } from "zod";

const reqText = z.string().min(1, "Requerido.");
const intMin0 = z.number({ error: "Ingresa un número" }).int().min(0, "Mínimo 0");

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
  allies: z.array(z.object({ nombre: reqText })),
  timeline: z.array(z.object({ year: reqText, title: reqText, description: z.string() })),
  mvv: z.object({ mision: reqText, vision: reqText, valores: reqText }),
  reasons: z.array(z.object({ number: z.string(), title: reqText, body: z.string() })),
  contact: z.object({
    email: z.string().email("Correo no válido"),
    location: reqText,
    meetingSchedule: reqText,
    links: z.array(z.object({ label: reqText, url: reqText })),
  }),
});

export type SiteConfigInput = z.infer<typeof siteConfigSchema>;
