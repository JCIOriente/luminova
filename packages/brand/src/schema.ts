import { z } from "zod";
import { normalizeSiteUrl } from "./urls.ts";

const text = z.string().trim().min(1);

const httpsOrigin = text.refine(
  (value) => {
    try {
      normalizeSiteUrl(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "must be a bare https origin, e.g. https://example.org" },
);

const httpsUrl = z.url({ protocol: /^https$/, message: "must be an https URL" });

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "must be a #RRGGBB hex color");

const webApp = z.strictObject({
  apiKey: text,
  appId: text,
  // Blank disables App Check / web push for that app, as in today's .env files.
  appCheckSiteKey: z.string(),
  vapidKey: z.string(),
});

// The hashed og-image.<sha256-8>.png and the source og-image.png are staged by the plugin.
const legacyOgPath = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/, "must be a bare .png file name")
  .refine((path) => !/^og-image(\.[0-9a-f]{8})?\.png$/.test(path), {
    message: "is reserved for the hashed OG image",
  });

export const brandSchema = z.strictObject({
  $schema: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase kebab-case"),
  name: text,
  shortName: text,
  legalName: text,
  movementName: text,
  description: text,
  locality: z.strictObject({
    city: text,
    cityFormal: text,
    region: text,
    // The bare-article short form some copy uses ("el Oriente" beside "el Oriente boliviano").
    regionShort: text,
    country: text,
  }),
  foundedYear: z.int().min(1900).max(2100),
  stats: z.strictObject({ nationalOrganizations: z.int().positive() }),
  parentOrganization: z.strictObject({ name: text, url: httpsUrl }),
  broadcastChannelName: text,
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "must be a language tag such as es"),
  ogLocale: z.string().regex(/^[a-z]{2,3}_[A-Z]{2}$/, "must be an Open Graph locale such as es_BO"),
  urls: z.strictObject({ spotlight: httpsOrigin, backstage: httpsOrigin }),
  qrPrefix: z.string().regex(/^[a-z0-9-]+$/, "must match [a-z0-9-]+ (no colon)"),
  themeColor: z.strictObject({ spotlight: hexColor, backstage: hexColor }),
  seo: z.strictObject({
    title: text,
    description: text,
    ogTitle: text,
    ogDescription: text,
    ogImageAlt: text,
    twitterDescription: text,
  }),
  backstage: z.strictObject({
    title: text,
    emailPlaceholder: text,
    // Where a member without an account asks for access (login page mailto).
    contactEmail: z.email({ message: "must be an email address" }),
  }),
  og: z
    .strictObject({ legacyPaths: z.array(legacyOgPath).default([]) })
    .default({ legacyPaths: [] }),
  firebase: z.strictObject({
    projectId: z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, "must be a Firebase project id"),
    storageBucket: text,
    sites: z.strictObject({ spotlight: text, backstage: text }),
    web: z.strictObject({
      authDomain: text,
      messagingSenderId: z.string().regex(/^\d+$/, "must be numeric"),
      spotlight: webApp,
      backstage: webApp,
    }),
  }),
  assetsBucket: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/, "must be a Cloud Storage bucket name"),
});

export type Brand = z.infer<typeof brandSchema>;

export function renderBrandJsonSchema(): string {
  return `${JSON.stringify(z.toJSONSchema(brandSchema, { io: "input" }), null, 2)}\n`;
}
