// Match module ids by node_modules / workspace path segments, never a bare
// "firebase" substring: the id is an absolute path, so a checkout directory
// named e.g. `firebase-13` would otherwise match every module in the build.
const FIREBASE_SDK = /\/node_modules\/(?:@firebase|firebase)\//;
const FIREBASE_WORKSPACE = /\/packages\/firebase\/src\//;
const MESSAGING =
  /\/node_modules\/@firebase\/messaging|\/node_modules\/firebase\/(?:[^/]+\/)*messaging|\/packages\/firebase\/src\/messaging/;
const SITE_CONFIG_FIRESTORE = /\/site-config-firestore[.\w-]*$/;

export function manualChunks(id: string): string | undefined {
  const path = id.replaceAll("\\", "/");
  if (MESSAGING.test(path)) return undefined;
  if (
    FIREBASE_SDK.test(path) ||
    FIREBASE_WORKSPACE.test(path) ||
    SITE_CONFIG_FIRESTORE.test(path)
  ) {
    return "site-data";
  }
  return undefined;
}
