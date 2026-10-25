export { brandSchema, type Brand } from "./schema.ts";
export { normalizeSiteUrl, resolveUrls, type BrandUrls } from "./urls.ts";
export { BRAND_APPS, DEV_PORTS, PREVIEW_PORTS, type BrandApp } from "./ports.ts";
export {
  BrandConfigError,
  EXAMPLE_PROFILE,
  REPO_ROOT,
  loadProfile,
  type LoadedProfile,
} from "./load-profile.ts";
export { ASSET_CONTRACT, validateAssets, type AssetValidation } from "./assets.ts";
