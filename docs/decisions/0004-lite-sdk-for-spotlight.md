# 0004. `firebase/firestore/lite` for the public site

**Status:** Accepted
**Date:** 2026-06-22
**Source:** `docs/specs/2026-06-22-spotlight-fast-page-load-design.md`;
`docs/performance.md`; `packages/firebase/src/firestore-lite.ts`.

## Context

The public site's `index` chunk had reached **296 kB / 92 kB gzipped**. The spec traced
the cause precisely: spotlight imported `getFirestoreLite` from the `@luminova/firebase`
barrel (`index.ts`), and that barrel statically imports the full
`firebase/auth + firestore + storage + functions + app-check`. The whole SDK landed in
the public bundle to support a lite client that was already there.

Spotlight reads three world-read collections and uses no auth, storage, functions or
app-check at runtime — the spec confirmed this by grep. The app's own instructions
already declared the invariant *"No other Firebase service may be imported;
`getFirebase()` is forbidden here"*. Nothing enforced it, and the barrel import violated
its spirit silently.

This is worth noting on its own: the rule existed, the code broke it, and only a bundle
measurement caught it.

## Decision

Add a second package export so consumers can pull firestore-lite without the barrel:

```jsonc
"exports": {
  ".":     "./src/index.ts",
  "./lite": "./src/firestore-lite.ts"
}
```

Spotlight imports `@luminova/firebase/lite` exclusively. `firestore-lite.ts` imports
only `firebase/app` and `firebase/firestore/lite`.

## Consequences

**Easy:** the public site's bundle no longer contains authentication, storage or
functions code. A visitor downloads what the page actually uses.

**Hard:**

- **No realtime, no auth, on the public site — permanently.** The lite SDK has no
  `onSnapshot`. Any public feature needing live updates or a signed-in user would have
  to reach for the full SDK and would undo this.
- **The invariant is still mostly convention.** The import boundary is enforced by the
  subpath being the only thing spotlight imports, plus bundle budgets in CI. A careless
  `@luminova/firebase` import would still compile.
- **Public data must be world-readable**, which reinforces
  [0008](0008-server-side-public-projections.md) — the lite client cannot authenticate,
  so it can only read collections open to everyone.

**Ruled out:** sharing one Firebase client singleton across both apps. The barrel is for
backstage; spotlight gets the subpath.

## Related

Part of a broader performance track also covering font subsetting, WebP conversion,
deferred below-fold reads and immutable caching. The playbook and the standing budgets
are in `docs/performance.md`; a bundle-budget check runs in CI.
