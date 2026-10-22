export type BrandApp = "spotlight" | "backstage";

export const BRAND_APPS: readonly BrandApp[] = ["spotlight", "backstage"];

export const DEV_PORTS: Readonly<Record<BrandApp, number>> = { spotlight: 5173, backstage: 5174 };

export const PREVIEW_PORTS: Readonly<Record<BrandApp, number>> = {
  spotlight: 4173,
  backstage: 4174,
};
