import { DEV_PORTS, PREVIEW_PORTS, type BrandApp } from "./ports.ts";

export function normalizeSiteUrl(siteUrl: string): string {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`site URL must be a bare https origin, got "${siteUrl}"`);
  }
  return url.origin;
}

export type BrandUrls = Record<BrandApp, string>;

export interface UrlContext {
  command: "serve" | "build";
  emulatorEnabled: boolean;
}

function localUrls(ports: Record<BrandApp, number>): BrandUrls {
  return {
    spotlight: `http://localhost:${ports.spotlight}`,
    backstage: `http://localhost:${ports.backstage}`,
  };
}

export function resolveUrls(
  production: BrandUrls,
  { command, emulatorEnabled }: UrlContext,
): BrandUrls {
  if (command === "serve") return localUrls(DEV_PORTS);
  if (emulatorEnabled) return localUrls(PREVIEW_PORTS);
  return {
    spotlight: normalizeSiteUrl(production.spotlight),
    backstage: normalizeSiteUrl(production.backstage),
  };
}
