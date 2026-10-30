import { mkdirSync } from "node:fs";
import { writeAssetSet } from "../asset-set.ts";
import { writeBrandToml } from "../brand-file.ts";

/**
 * The canary chapter (spec D8): a chapter no one has, written over the example with a sentinel
 * in every identity and text field, so brand:guard can prove the example build carries no
 * chapter's data while git holds no chapter. Movement-wide values (D10) stay the example's.
 */
export const CANARY_NAME = "Cámara Canaria Zyx";
export const CANARY_CITY = "Qwertópolis";

const SITE = "https://canaria-zyx.example.net";

const CANARY_FILE = {
  name: CANARY_NAME,
  city: CANARY_CITY,
  country: "Bolivia",
  project: "canaria-zyx",
  shortName: "Canaria Zyx",
  legalName: "Asociación Canaria Zyx de Qwertópolis",
  description: "Capítulo Canaria Zyx de Qwertópolis",
  foundedYear: 1987,
  broadcastChannelName: "Difusión Canaria Zyx",
  qrPrefix: "canariazyxqr",
  colors: { spotlight: "#A1B2C3", backstage: "#C3B2A1" },
  locality: {
    cityFormal: "Villa Qwertópolis de la Canaria",
    region: "la comarca Zyxiana",
    regionShort: "Zyxiana",
  },
  urls: { spotlight: SITE, backstage: "https://admin.canaria-zyx.example.net" },
  seo: {
    title: "Canaria Zyx: título centinela",
    description: "Canaria Zyx: descripción centinela del buscador",
    ogTitle: "Canaria Zyx: título centinela al compartir",
    ogDescription: "Canaria Zyx: descripción centinela al compartir",
    ogImageAlt: "Canaria Zyx: imagen centinela",
    twitterDescription: "Canaria Zyx: descripción centinela para X",
  },
  backstage: {
    title: "Canaria Zyx: portal centinela",
    emailPlaceholder: "socio@canaria-zyx.example.net",
    contactEmail: "acceso@canaria-zyx.example.net",
  },
  og: { legacyPaths: ["og-canaria-zyx.png"] },
  firebase: {
    sites: { spotlight: "canaria-zyx-sitio", backstage: "canaria-zyx-admin" },
    spotlight: {
      apiKey: "AIzaCanariaZyxSpotlightKey",
      appId: "1:987654321098:web:canariazyx01",
      appCheckSiteKey: "6LCanariaZyxSpotlightSiteKey",
      vapidKey: "BCanariaZyxSpotlightVapidKey",
    },
    backstage: {
      apiKey: "AIzaCanariaZyxBackstageKey",
      appId: "1:987654321098:web:canariazyx02",
      appCheckSiteKey: "6LCanariaZyxBackstageSiteKey",
      vapidKey: "BCanariaZyxBackstageVapidKey",
    },
  },
  hero: { motto: "Canaria Zyx: lema centinela", submotto: "Canaria Zyx: sublema centinela" },
  stats: {
    nationalOrganizations: 13,
    programCount: 17,
    countries: "Zyx países",
    membersWorldwide: "Zyx miembros",
    nationalAwards: 19,
    efficiencyPct: 23,
    standoutOrg: { year: "1999", title: "Canaria Zyx: distinción centinela" },
  },
  timeline: [1, 2].map((index) => ({
    year: `Zyx año ${index}`,
    title: `Canaria Zyx: hito centinela ${index}`,
    description: `Canaria Zyx: relato centinela del hito ${index}`,
  })),
  mvv: {
    mision: "Canaria Zyx: misión centinela",
    vision: "Canaria Zyx: visión centinela",
    valores: "Canaria Zyx: valores centinela",
  },
  reasons: [1, 2, 3].map((index) => ({
    number: `Zyx-0${index}`,
    title: `Canaria Zyx: razón centinela ${index}`,
    body: `Canaria Zyx: cuerpo centinela de la razón ${index}`,
  })),
  contact: {
    email: "hola@canaria-zyx.example.net",
    location: "Canaria Zyx: lugar centinela",
    meetingSchedule: "Canaria Zyx: horario centinela",
    mapUrl: `${SITE}/mapa`,
    whatsapp: `${SITE}/whatsapp`,
    broadcastChannel: `${SITE}/canal`,
    socials: {
      instagram: `${SITE}/instagram`,
      facebook: `${SITE}/facebook`,
      tiktok: `${SITE}/tiktok`,
      linkedin: `${SITE}/linkedin`,
    },
    links: [1, 2].map((index) => ({
      label: `Canaria Zyx: enlace centinela ${index}`,
      url: `${SITE}/enlace-${index}`,
    })),
  },
  linktree: {
    handle: "@canariazyx",
    tagline: "Canaria Zyx: frase centinela",
    taglineAccent: "Canaria Zyx: acento centinela",
    links: [
      {
        id: "canaria-zyx-1",
        icon: "globe",
        title: "Canaria Zyx: tarjeta centinela",
        description: "Canaria Zyx: detalle centinela",
        url: `${SITE}/tarjeta`,
        isPrimary: true,
        badge: "Canaria Zyx",
        active: true,
      },
    ],
    socials: [{ platform: "instagram", url: `${SITE}/red` }],
  },
};

/**
 * Writes the canary into `dir` (brand/local/ while brand:guard builds): its brand.toml and 16
 * solid images in colours no other image shares, a different one per file.
 */
export function writeCanary(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeBrandToml(dir, CANARY_FILE);
  writeAssetSet(dir, (_spec, index) => [0xa1, 0xb2, 0x10 + index * 9]);
}
