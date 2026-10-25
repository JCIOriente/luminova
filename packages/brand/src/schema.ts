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

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MESSAGE = "must be lowercase kebab-case";

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

const deploySchema = z
  .strictObject({
    workloadIdentityProvider: z
      .string()
      .regex(
        /^projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/,
        "must be projects/<project number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>",
      )
      .describe(
        "The Workload Identity provider CD signs in through, without a stored key. docs/ci-cd.md section 6 creates it; pnpm brand:provision prints the value.",
      ),
    serviceAccount: z
      .email({ message: "must be a service account email" })
      .describe(
        "The service account CD deploys as, e.g. firebase-deployer@<projectId>.iam.gserviceaccount.com.",
      ),
  })
  .describe(
    "How CD (GitHub Actions) signs in to Google Cloud. Names, not secrets: safe to commit. Needed only to deploy.",
  );

const d = <T extends z.ZodType>(schema: T, description: string) => schema.describe(description);

export const brandSchema = z
  .strictObject({
    $schema: z.string().optional(),
    slug: d(
      z.string().regex(SLUG_PATTERN, SLUG_MESSAGE),
      "This profile's folder name under brand/; luminova.json selects it.",
    ),
    name: d(text, "The chapter's name as people say it, e.g. JCI Oriente."),
    shortName: d(text, "A short form for tight places (app name on a phone's home screen)."),
    legalName: d(text, "The registered legal name, for the footer and legal pages."),
    movementName: d(
      text,
      "The movement's name in your language, e.g. Cámara Junior Internacional.",
    ),
    description: d(text, "One line about the chapter, used in the web app manifest."),
    locality: d(
      z
        .strictObject({
          city: d(text, "City as used in a sentence, e.g. Santa Cruz."),
          cityFormal: d(text, "The city's formal name, e.g. Santa Cruz de la Sierra."),
          region: d(text, "Region as used in a sentence, e.g. el Oriente boliviano."),
          // The bare-article short form some copy uses ("el Oriente" beside "el Oriente boliviano");
          // a region without one reads fine in full.
          regionShort: d(
            text.optional(),
            "Optional short region, e.g. el Oriente. Blank means the same as region.",
          ),
          country: d(text, "Country, e.g. Bolivia."),
        })
        .transform(({ regionShort, ...locality }) => ({
          ...locality,
          regionShort: regionShort ?? locality.region,
        })),
      "Where the chapter is; the site's copy uses these words.",
    ),
    foundedYear: d(z.int().min(1900).max(2100), "Year the chapter was founded."),
    stats: d(
      z.strictObject({ nationalOrganizations: z.int().positive() }),
      "Numbers the home page states. nationalOrganizations: local organizations in the national federation.",
    ),
    parentOrganization: d(
      z.strictObject({ name: text, url: httpsUrl }),
      "The national federation the site links to.",
    ),
    broadcastChannelName: d(text, "Name of the chapter's WhatsApp broadcast channel."),
    locale: d(
      z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "must be a language tag such as es"),
      "The site's language tag, e.g. es.",
    ),
    ogLocale: d(
      z.string().regex(/^[a-z]{2,3}_[A-Z]{2}$/, "must be an Open Graph locale such as es_BO"),
      "Language and country for link previews, e.g. es_BO.",
    ),
    urls: d(
      z.strictObject({ spotlight: httpsOrigin, backstage: httpsOrigin }),
      "Public addresses: spotlight is the public site, backstage the admin site. Bare https origins, no path.",
    ),
    qrPrefix: d(
      z.string().regex(/^[a-z0-9-]+$/, "must match [a-z0-9-]+ (no colon)"),
      "Prefix inside member QR credentials. Never change it once credentials are issued: old QR codes would stop scanning.",
    ),
    themeColor: d(
      z.strictObject({ spotlight: hexColor, backstage: hexColor }),
      "Browser and home-screen color of each site, #RRGGBB.",
    ),
    seo: d(
      z.strictObject({
        title: text,
        description: text,
        ogTitle: text,
        ogDescription: text,
        ogImageAlt: text,
        twitterDescription: text,
      }),
      "What search engines and link previews (WhatsApp, Facebook, X) show for the public site.",
    ),
    backstage: d(
      z.strictObject({
        title: text,
        emailPlaceholder: text,
        // Where a member without an account asks for access (login page mailto).
        contactEmail: z.email({ message: "must be an email address" }),
      }),
      "Admin site texts. contactEmail is where a member without an account asks for access.",
    ),
    og: d(
      z
        .strictObject({ legacyPaths: z.array(legacyOgPath).default([]) })
        .default({ legacyPaths: [] }),
      "Old share-image file names that must keep working because apps cached them.",
    ),
    firebase: d(
      z.strictObject({
        projectId: d(
          z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, "must be a Firebase project id"),
          "Your Firebase project id (Firebase console → Project settings). Builds and deploys target it.",
        ),
        storageBucket: d(
          text,
          "The project's Cloud Storage bucket, usually <projectId>.firebasestorage.app.",
        ),
        sites: d(
          z.strictObject({ spotlight: text, backstage: text }),
          "Firebase Hosting site ids for the public and the admin site.",
        ),
        web: d(
          z.strictObject({
            authDomain: text,
            messagingSenderId: z.string().regex(/^\d+$/, "must be numeric"),
            spotlight: webApp,
            backstage: webApp,
          }),
          "Each web app's config from Firebase console → Project settings → Your apps. Public identifiers, not secrets. A blank appCheckSiteKey or vapidKey turns that feature off.",
        ),
      }),
      "The Firebase project this chapter runs on.",
    ),
    assetsBucket: d(
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/, "must be a Cloud Storage bucket name"),
      "Private bucket holding the chapter's logos and icons for deploys, usually <projectId>-brand-assets. pnpm brand:provision creates it.",
    ),
    deploy: deploySchema.optional(),
  })
  .describe(
    "A chapter's brand profile: names, texts, addresses and the Firebase project. Every value here is public.",
  );

export type Brand = z.infer<typeof brandSchema>;

export function renderBrandJsonSchema(): string {
  return `${JSON.stringify(z.toJSONSchema(brandSchema, { io: "input" }), null, 2)}\n`;
}
