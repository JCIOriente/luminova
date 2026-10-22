import { describe, expect, it } from "vitest";
import { manualChunks } from "./chunking";

const ROOTS = ["/work/luminova", "/work/firebase-13/luminova", "C:\\work\\firebase\\luminova"];

describe.each(ROOTS)("manualChunks under %s", (root) => {
  const at = (rel: string) => `${root}/${rel}`;

  it("pins the firebase SDK, the workspace wrapper and the site-config reader into site-data", () => {
    expect(
      manualChunks(
        at("node_modules/.pnpm/firebase@13.1.0/node_modules/firebase/firestore/lite/dist/index.js"),
      ),
    ).toBe("site-data");
    expect(
      manualChunks(
        at(
          "node_modules/.pnpm/@firebase+app@0.16.4/node_modules/@firebase/app/dist/esm/index.esm.js",
        ),
      ),
    ).toBe("site-data");
    expect(manualChunks(at("packages/firebase/src/app-core.ts"))).toBe("site-data");
    expect(manualChunks(at("apps/spotlight/src/site-config/site-config-firestore.ts"))).toBe(
      "site-data",
    );
  });

  it("leaves messaging to rolldown's colocation", () => {
    expect(
      manualChunks(
        at(
          "node_modules/.pnpm/@firebase+messaging@0.12.0/node_modules/@firebase/messaging/dist/esm/index.esm.js",
        ),
      ),
    ).toBeUndefined();
    expect(
      manualChunks(
        at(
          "node_modules/.pnpm/firebase@13.1.0/node_modules/firebase/messaging/dist/esm/index.esm.js",
        ),
      ),
    ).toBeUndefined();
    expect(manualChunks(at("packages/firebase/src/messaging.ts"))).toBeUndefined();
  });

  it("does not capture unrelated modules just because the checkout path says firebase", () => {
    expect(manualChunks(at("apps/spotlight/src/main.tsx"))).toBeUndefined();
    expect(
      manualChunks(at("node_modules/.pnpm/react@19.3.1/node_modules/react/index.js")),
    ).toBeUndefined();
    expect(manualChunks(at("apps/spotlight/src/site-config/use-site-config.ts"))).toBeUndefined();
  });
});
