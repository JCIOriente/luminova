import { z } from "zod";
import { DEPLOY_SA } from "./deploy-identity.ts";
import { emailOrBlank, siteContentTables } from "./site-content.ts";
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

const DEMO_PROJECT_PREFIX = "demo-";

/** A `demo-` project exists only in the Firebase emulators. */
export const isDemoProject = (projectId: string) => projectId.startsWith(DEMO_PROJECT_PREFIX);

/** The emulator-only project a local profile runs on, kept within Firebase's 30 characters. */
export const demoProjectId = (slug: string) =>
  `${DEMO_PROJECT_PREFIX}${slug}`.slice(0, 30).replace(/-+$/, "");

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "must be a #RRGGBB hex color");

const siteId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "must be a Firebase Hosting site id");

const webApp = z
  .strictObject({
    apiKey: text.optional(),
    appId: z
      .string()
      .regex(/^1:\d+:web:[A-Za-z0-9]+$/, "must look like 1:<number>:web:<id>")
      .optional(),
    appCheckSiteKey: z.string().optional().describe("Blank or absent keeps App Check off."),
    vapidKey: z.string().optional().describe("Blank or absent keeps web push off."),
  })
  .describe(
    "This web app's public config, which pnpm brand:init reads with firebase apps:sdkconfig. Not secrets. A demo- project needs none.",
  );

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
        "The Workload Identity provider CD signs in through, without a stored key. pnpm brand:provision prints the value.",
      ),
    serviceAccount: z
      .email({ message: "must be a service account email" })
      .describe(
        `The service account CD deploys as, e.g. ${DEPLOY_SA}@<project>.iam.gserviceaccount.com.`,
      ),
  })
  .describe(
    "How CD (GitHub Actions) signs in to Google Cloud. Names, not secrets. Needed only to deploy.",
  );

const projectId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, "must be a Firebase project id")
  .describe(
    "Your Firebase project id (Firebase console → Project settings). A demo- id runs only in the emulators.",
  );

/**
 * brand.toml after the chapter is layered on the example and its templates are expanded.
 * Every key the example sets is required here; the keys derived from `project` stay
 * optional. A chapter's own file is the same shape with only the identity required
 * (renderBrandJsonSchema).
 */
export const brandFileSchema = z
  .strictObject({
    name: text.describe("The chapter's name as people say it, e.g. JCI Andina. Required."),
    city: text.describe("The city, as used in a sentence, e.g. Cochabamba. Required."),
    country: text.describe("The country, e.g. Bolivia. Required."),
    project: projectId,
    shortName: text.describe("A short form for tight places (app name on a phone's home screen)."),
    legalName: text.describe("The registered legal name, for the footer and legal pages."),
    movementName: text.describe(
      "The movement's name in your language, e.g. Cámara Junior Internacional.",
    ),
    description: text.describe("One line about the chapter, used in the web app manifest."),
    foundedYear: z
      .int()
      .min(1900)
      .max(2100)
      .describe("Year the chapter was founded. Set it: the example's year is no one's."),
    broadcastChannelName: text.describe("Name of the chapter's WhatsApp broadcast channel."),
    locale: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "must be a language tag such as es")
      .describe("The site's language tag, e.g. es."),
    ogLocale: z
      .string()
      .regex(/^[a-z]{2,3}_[A-Z]{2}$/, "must be an Open Graph locale such as es_BO")
      .describe("Language and country for link previews, e.g. es_BO."),
    qrPrefix: z
      .string()
      .regex(/^[a-z0-9-]+$/, "must match [a-z0-9-]+ (no colon)")
      .optional()
      .describe(
        "Prefix inside member QR credentials; defaults to the project id without hyphens. Never change it once credentials are printed: old QR codes would stop scanning.",
      ),
    assetsBucket: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/, "must be a Cloud Storage bucket name")
      .optional()
      .describe(
        "Private bucket holding the chapter's images for deploys; defaults to <project>-brand-assets. pnpm brand:provision creates it.",
      ),
    locality: z
      .strictObject({
        cityFormal: text.describe("The city's formal name, e.g. Santa Cruz de la Sierra."),
        region: text.describe("Region as used in a sentence, e.g. el Oriente boliviano."),
        regionShort: text.describe("A short form some copy uses, e.g. el Oriente."),
      })
      .describe("More of where the chapter is; the site's copy uses these words."),
    colors: z
      .strictObject({
        spotlight: hexColor.describe("The public site's theme color, #RRGGBB. Required."),
        backstage: hexColor.describe("The admin site's theme color, #RRGGBB."),
      })
      .describe("Browser and home-screen color of each site."),
    parentOrganization: z
      .strictObject({ name: text, url: httpsUrl })
      .describe("The national federation the site links to."),
    urls: z
      .strictObject({
        spotlight: httpsOrigin.optional(),
        backstage: httpsOrigin.optional(),
      })
      .optional()
      .describe(
        "Public addresses, bare https origins. Default: https://<hosting site>.web.app for each.",
      ),
    seo: z
      .strictObject({
        title: text,
        description: text,
        ogTitle: text,
        ogDescription: text,
        ogImageAlt: text,
        twitterDescription: text,
      })
      .describe(
        "What search engines and link previews (WhatsApp, Facebook, X) show for the public site.",
      ),
    backstage: z
      .strictObject({
        title: text,
        emailPlaceholder: text,
        contactEmail: emailOrBlank
          .optional()
          .describe(
            "Where a member without an account asks for access (login page). Defaults to [contact] email; with neither, the page shows no link.",
          ),
      })
      .describe("Admin site texts."),
    og: z
      .strictObject({ legacyPaths: z.array(legacyOgPath) })
      .describe("Old share-image file names that must keep working because apps cached them."),
    firebase: z
      .strictObject({
        storageBucket: text
          .optional()
          .describe("Cloud Storage bucket; defaults to <project>.firebasestorage.app."),
        authDomain: text.optional().describe("Defaults to <project>.firebaseapp.com."),
        messagingSenderId: z
          .string()
          .regex(/^\d+$/, "must be numeric")
          .optional()
          .describe("Defaults to the number inside the spotlight appId."),
        sites: z
          .strictObject({ spotlight: siteId.optional(), backstage: siteId.optional() })
          .optional()
          .describe("Firebase Hosting site ids. Default: <project> and <project>-backstage."),
        spotlight: webApp.optional(),
        backstage: webApp.optional(),
      })
      .optional()
      .describe("The Firebase project's values; each defaults from `project`."),
    deploy: deploySchema.optional(),
    ...siteContentTables,
  })
  .superRefine((file, context) => {
    if (typeof file.project !== "string" || isDemoProject(file.project)) return;
    for (const app of ["spotlight", "backstage"] as const) {
      for (const key of ["apiKey", "appId"] as const) {
        if (file.firebase?.[app]?.[key] !== undefined) continue;
        context.addIssue({
          code: "custom",
          path: ["firebase", app, key],
          message: "required for a real Firebase project (pnpm brand:init writes it)",
        });
      }
    }
  })
  .describe(
    "A chapter's brand: names, texts, addresses and the Firebase project. Every value here is public. Anything left out comes from brand/example/brand.toml.",
  );

export type BrandFile = z.infer<typeof brandFileSchema>;

interface WebAppConfig {
  apiKey: string;
  appId: string;
  appCheckSiteKey: string;
  vapidKey: string;
}

/** The resolved brand every build and command reads. */
export interface Brand {
  slug: string;
  name: string;
  shortName: string;
  legalName: string;
  movementName: string;
  description: string;
  locality: {
    city: string;
    cityFormal: string;
    region: string;
    country: string;
    regionShort: string;
  };
  foundedYear: number;
  stats: { nationalOrganizations: number };
  parentOrganization: { name: string; url: string };
  broadcastChannelName: string;
  locale: string;
  ogLocale: string;
  urls: { spotlight: string; backstage: string };
  qrPrefix: string;
  themeColor: { spotlight: string; backstage: string };
  seo: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    ogImageAlt: string;
    twitterDescription: string;
  };
  backstage: { title: string; emailPlaceholder: string; contactEmail: string };
  og: { legacyPaths: string[] };
  firebase: {
    projectId: string;
    storageBucket: string;
    sites: { spotlight: string; backstage: string };
    web: {
      authDomain: string;
      messagingSenderId: string;
      spotlight: WebAppConfig;
      backstage: WebAppConfig;
    };
  };
  assetsBucket: string;
  deploy?: { workloadIdentityProvider: string; serviceAccount: string };
}

/** What a demo- project's web apps use when the file names none; the emulators accept any. */
const DEMO_API_KEY = "demo-api-key";
const demoAppId = (app: string) => `1:0:web:${app}`;

/** The brand a build reads: the validated file with every default from `project` filled in. */
export function toBrand(file: BrandFile, slug: string): Brand {
  const { project, firebase = {} } = file;
  const web = (app: "spotlight" | "backstage"): WebAppConfig => {
    const own = firebase[app] ?? {};
    return {
      apiKey: own.apiKey ?? DEMO_API_KEY,
      appId: own.appId ?? demoAppId(app),
      appCheckSiteKey: own.appCheckSiteKey ?? "",
      vapidKey: own.vapidKey ?? "",
    };
  };
  const spotlight = web("spotlight");
  const sites = {
    spotlight: firebase.sites?.spotlight ?? project,
    backstage: firebase.sites?.backstage ?? `${project}-backstage`,
  };
  return {
    slug,
    name: file.name,
    shortName: file.shortName,
    legalName: file.legalName,
    movementName: file.movementName,
    description: file.description,
    locality: {
      city: file.city,
      cityFormal: file.locality.cityFormal,
      region: file.locality.region,
      country: file.country,
      regionShort: file.locality.regionShort,
    },
    foundedYear: file.foundedYear,
    stats: { nationalOrganizations: file.stats.nationalOrganizations },
    parentOrganization: file.parentOrganization,
    broadcastChannelName: file.broadcastChannelName,
    locale: file.locale,
    ogLocale: file.ogLocale,
    urls: {
      spotlight: file.urls?.spotlight ?? `https://${sites.spotlight}.web.app`,
      backstage: file.urls?.backstage ?? `https://${sites.backstage}.web.app`,
    },
    qrPrefix: file.qrPrefix ?? project.replaceAll("-", ""),
    themeColor: file.colors,
    seo: file.seo,
    backstage: {
      title: file.backstage.title,
      emailPlaceholder: file.backstage.emailPlaceholder,
      contactEmail: file.backstage.contactEmail ?? file.contact.email,
    },
    og: file.og,
    firebase: {
      projectId: project,
      storageBucket: firebase.storageBucket ?? `${project}.firebasestorage.app`,
      sites,
      web: {
        authDomain: firebase.authDomain ?? `${project}.firebaseapp.com`,
        // A web app id is 1:<sender id>:web:<hash>; the schema checks that shape.
        messagingSenderId: firebase.messagingSenderId ?? spotlight.appId.split(":")[1] ?? "0",
        spotlight,
        backstage: web("backstage"),
      },
    },
    assetsBucket: file.assetsBucket ?? `${project}-brand-assets`,
    ...(file.deploy ? { deploy: file.deploy } : {}),
  };
}

/**
 * Required in a chapter's own file, by table: the identity. Everything else comes from the
 * example, so the editor schema marks it optional; an array's items stay whole, because a
 * chapter's array replaces the example's.
 */
const REQUIRED_IN_A_CHAPTER: Readonly<Record<string, readonly string[]>> = {
  "": ["name", "city", "country", "project", "colors"],
  colors: ["spotlight"],
};

type JsonNode = Record<string, unknown>;
const isNode = (value: unknown): value is JsonNode =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function chapterRequired(node: unknown, path: string, inItem: boolean): unknown {
  if (Array.isArray(node)) return node.map((child) => chapterRequired(child, path, inItem));
  if (!isNode(node)) return node;
  const out: JsonNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && isNode(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
          name,
          chapterRequired(child, path ? `${path}.${name}` : name, inItem),
        ]),
      );
    } else if (key === "items") {
      out[key] = chapterRequired(value, path, true);
    } else if (key === "required" && Array.isArray(value) && !inItem) {
      const keep = REQUIRED_IN_A_CHAPTER[path] ?? [];
      const required = value.filter((name) => keep.includes(String(name)));
      if (required.length > 0) out[key] = required;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** The editor schema of a brand.toml (Taplo, Even Better TOML): only the identity required. */
export function renderBrandJsonSchema(): string {
  const schema = z.toJSONSchema(brandFileSchema, { io: "input" });
  return `${JSON.stringify(chapterRequired(schema, "", false), null, 2)}\n`;
}
