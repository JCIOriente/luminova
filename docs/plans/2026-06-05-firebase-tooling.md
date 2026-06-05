# Firebase Tooling Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Firebase tooling (config, emulators, shared client package, App Check, auth, functions scaffold) and a clean production project for the Luminova monorepo.

**Architecture:** One Firebase project (`jci-oriente`) with two web-app registrations (spotlight, backstage) on separate hosting sites and separate bundles. spotlight ships zero Firebase by default and lazy-`import()`s a shared `@luminova/firebase` client only on dynamic routes; backstage imports it at boot. App Check (reCAPTCHA v3) is coded with debug-token support but left unenforced until real keys exist. Functions (`beacon`) are scaffolded, not implemented.

**Tech Stack:** Firebase JS SDK (modular), Firebase CLI + emulators, `firebase-admin` / `firebase-functions`, `@firebase/rules-unit-testing`, Vitest 4, pnpm workspaces, Turborepo, TypeScript 6 strict.

**Spec:** `docs/specs/2026-06-05-firebase-tooling-setup-design.md`

**Dependency rule:** Never type a version from memory. At every step that adds a dependency, invoke the `secure-dep-vetting` skill to resolve the latest secure Node-24-compatible version, then write that exact value. Placeholders below read `<vetted>`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `firebase.json` | Hosting targets, emulator ports, functions block |
| `.firebaserc` | Default project + hosting target aliases |
| `firestore.rules` | Firestore access control + App Check assertions |
| `firestore.indexes.json` | Composite indexes |
| `storage.rules` | Storage access control |
| `packages/firebase/package.json` | `@luminova/firebase` manifest |
| `packages/firebase/tsconfig.json` | Package TS config |
| `packages/firebase/src/index.ts` | `getFirebase()` memoized client singleton |
| `packages/firebase/src/index.test.ts` | Unit tests for init/memoization/emulator |
| `apps/spotlight/.env.local.example` | spotlight web-app config template |
| `apps/backstage/.env.local.example` | backstage web-app config template |
| `apps/beacon/src/index.ts` | `awardPoints` `onDocumentWritten` scaffold |
| `apps/beacon/package.json` | Functions deps + emit build + `main` entry |
| `tests/firestore-rules/rules.test.ts` | `@firebase/rules-unit-testing` suite |
| `tools/scripts/seed-emulator.mjs` | Seed Firestore emulator with sample data |
| `tools/scripts/wipe-prod.md` | Human-gated production wipe runbook |
| `docs/firebase-setup.md` | Updated setup + console checklist |
| `docs/architecture.md` | Updated for two web apps + App Check |

---

## Task 1: Root Firebase config + register backstage web app

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`

- [ ] **Step 1: Register the backstage web app and capture its config**

Run:
```bash
firebase apps:create WEB backstage --project jci-oriente
firebase apps:sdkconfig WEB --project jci-oriente
```
Expected: a new web app `appId` is printed. Record both the existing spotlight app
config and the new backstage app config (used in Task 4). List apps to confirm two web
apps exist:
```bash
firebase apps:list --project jci-oriente
```
Expected: two `WEB` apps listed.

- [ ] **Step 2: Write `.firebaserc`**

```json
{
  "projects": {
    "default": "jci-oriente"
  },
  "targets": {
    "jci-oriente": {
      "hosting": {
        "jcioriente": ["jcioriente"],
        "jcioriente-backstage": ["jcioriente-backstage"]
      }
    }
  }
}
```

- [ ] **Step 3: Write `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": [
    {
      "source": "apps/beacon",
      "codebase": "beacon",
      "runtime": "nodejs24",
      "predeploy": ["pnpm --filter beacon build"]
    }
  ],
  "hosting": [
    {
      "target": "jcioriente",
      "public": "apps/spotlight/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    {
      "target": "jcioriente-backstage",
      "public": "apps/backstage/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  ],
  "emulators": {
    "auth": { "port": 4030 },
    "firestore": { "port": 4010 },
    "functions": { "port": 4020 },
    "hosting": { "port": 4000 },
    "ui": { "enabled": true, "port": 4100 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 4: Apply hosting targets and verify**

Run:
```bash
firebase target:apply hosting jcioriente jcioriente --project jci-oriente
firebase target:apply hosting jcioriente-backstage jcioriente-backstage --project jci-oriente
```
Expected: "Applied hosting target" for each, matching `.firebaserc`.

- [ ] **Step 5: Commit**

```bash
git add firebase.json .firebaserc
git commit -m "chore(firebase): root config, hosting targets, emulator ports"
```

---

## Task 2: Firestore + Storage rules with rules-unit-testing

**Files:**
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `storage.rules`
- Create: `tests/firestore-rules/rules.test.ts`
- Create: `tests/firestore-rules/package.json`
- Create: `tests/firestore-rules/tsconfig.json`

> Public collections (read without auth) for now: `projects`, `board`. Everything else
> requires auth. All writes require auth. App Check assertion is written but inert (no
> enforcement configured yet).

- [ ] **Step 1: Scaffold the rules test workspace package**

Create `tests/firestore-rules/package.json`:
```json
{
  "name": "@luminova/firestore-rules-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "ci": "vitest run"
  }
}
```
Add dev deps with vetted versions (invoke `secure-dep-vetting`):
```bash
pnpm --filter @luminova/firestore-rules-tests add -D \
  @firebase/rules-unit-testing@<vetted> firebase@<vetted> vitest@<vetted>
```

Create `tests/firestore-rules/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023"], "types": ["node"] },
  "include": ["."]
}
```

- [ ] **Step 2: Write the failing rules test**

Create `tests/firestore-rules/rules.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: {
      host: "127.0.0.1",
      port: 4010,
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("firestore.rules", () => {
  it("allows anyone to read public projects", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "projects/p1")));
  });

  it("denies anonymous writes to projects", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "projects/p1"), { title: "x" }));
  });

  it("denies anonymous reads of members", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "members/m1")));
  });

  it("allows authenticated reads of members", async () => {
    const db = env.authenticatedContext("admin").firestore();
    await assertSucceeds(getDoc(doc(db, "members/m1")));
  });

  it("allows authenticated writes to members", async () => {
    const db = env.authenticatedContext("admin").firestore();
    await assertSucceeds(setDoc(doc(db, "members/m1"), { name: "Ana" }));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (Firestore emulator must be running — start it in another shell with
`firebase emulators:start --only firestore`):
```bash
pnpm --filter @luminova/firestore-rules-tests test
```
Expected: FAIL — `firestore.rules` does not exist yet / connection or rules load error.

- [ ] **Step 4: Write `firestore.rules`**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    match /projects/{projectId} {
      allow read: if true;
      allow write: if isSignedIn();
    }

    match /board/{boardId} {
      allow read: if true;
      allow write: if isSignedIn();
    }

    match /{document=**} {
      allow read, write: if isSignedIn();
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
pnpm --filter @luminova/firestore-rules-tests test
```
Expected: PASS — all five assertions green.

- [ ] **Step 6: Write `firestore.indexes.json`**

```json
{
  "indexes": [
    {
      "collectionGroup": "members",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "active", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 7: Write `storage.rules`**

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /members/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add firestore.rules firestore.indexes.json storage.rules tests/firestore-rules
git commit -m "feat(firebase): firestore + storage rules with rules-unit tests"
```

---

## Task 3: `@luminova/firebase` client package

**Files:**
- Create: `packages/firebase/package.json`
- Create: `packages/firebase/tsconfig.json`
- Create: `packages/firebase/src/index.ts`
- Create: `packages/firebase/src/index.test.ts`

- [ ] **Step 1: Write the package manifest**

`packages/firebase/package.json`:
```json
{
  "name": "@luminova/firebase",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "build": "tsc --noEmit",
    "ci": "eslint . && tsc --noEmit && vitest run --passWithNoTests"
  },
  "dependencies": {
    "firebase": "<vetted>"
  }
}
```
Install with the vetted version (invoke `secure-dep-vetting` for `firebase` — pin exact
per CLAUDE.md security-critical rule):
```bash
pnpm --filter @luminova/firebase add firebase@<vetted>
```

`packages/firebase/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023", "DOM", "DOM.Iterable"] },
  "include": ["src", "*.config.ts"]
}
```

- [ ] **Step 2: Write the failing test**

`packages/firebase/src/index.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializeApp = vi.fn(() => ({ name: "app" }));
const getApps = vi.fn(() => []);
const getApp = vi.fn(() => ({ name: "app" }));
const getAuth = vi.fn(() => ({}));
const connectAuthEmulator = vi.fn();
const getFirestore = vi.fn(() => ({}));
const connectFirestoreEmulator = vi.fn();
const getStorage = vi.fn(() => ({}));
const connectStorageEmulator = vi.fn();
const initializeAppCheck = vi.fn();
const ReCaptchaV3Provider = vi.fn();

vi.mock("firebase/app", () => ({ initializeApp, getApps, getApp }));
vi.mock("firebase/auth", () => ({ getAuth, connectAuthEmulator }));
vi.mock("firebase/firestore", () => ({ getFirestore, connectFirestoreEmulator }));
vi.mock("firebase/storage", () => ({ getStorage, connectStorageEmulator }));
vi.mock("firebase/app-check", () => ({ initializeAppCheck, ReCaptchaV3Provider }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv("VITE_FIREBASE_API_KEY", "k");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "demo");
  vi.stubEnv("VITE_FIREBASE_APP_ID", "1:1:web:1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getFirebase", () => {
  it("initializes the app once and memoizes services", async () => {
    const { getFirebase } = await import("./index");
    const first = getFirebase();
    const second = getFirebase();
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("does not connect emulators when the flag is off", async () => {
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
  });

  it("connects emulators when the flag is on", async () => {
    vi.stubEnv("VITE_FIREBASE_EMULATOR_ENABLED", "true");
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(connectFirestoreEmulator).toHaveBeenCalledWith({}, "127.0.0.1", 4010);
    expect(connectAuthEmulator).toHaveBeenCalled();
    expect(connectStorageEmulator).toHaveBeenCalledWith({}, "127.0.0.1", 9199);
  });

  it("skips App Check when no site key is set", async () => {
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("initializes App Check when a site key is set", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
pnpm --filter @luminova/firebase test
```
Expected: FAIL — `./index` has no `getFirebase` export.

- [ ] **Step 4: Write the implementation**

`packages/firebase/src/index.ts`:
```ts
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
};

const EMULATOR_HOST = "127.0.0.1";
const FIRESTORE_PORT = 4010;
const AUTH_PORT = 4030;
const STORAGE_PORT = 9199;

let services: FirebaseServices | null = null;

function env(key: string): string | undefined {
  return import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
}

export function getFirebase(): FirebaseServices {
  if (services) return services;

  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: env("VITE_FIREBASE_API_KEY"),
        authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
        projectId: env("VITE_FIREBASE_PROJECT_ID"),
        storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
        messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
        appId: env("VITE_FIREBASE_APP_ID"),
      });

  const debugToken = env("VITE_APPCHECK_DEBUG_TOKEN");
  if (debugToken) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string })
      .FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  const siteKey = env("VITE_APPCHECK_SITE_KEY");
  if (siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (env("VITE_FIREBASE_EMULATOR_ENABLED") === "true") {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_PORT);
    connectStorageEmulator(storage, EMULATOR_HOST, STORAGE_PORT);
  }

  services = { app, auth, db, storage };
  return services;
}
```

> Note the Storage emulator port is `9199` (Firebase default; not in the docs table).
> Add a `storage` emulator block to `firebase.json` if you want it pinned — otherwise the
> CLI assigns 9199 by default. To pin it, add `"storage": { "port": 9199 }` under
> `emulators` in `firebase.json`.

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
pnpm --filter @luminova/firebase test
```
Expected: PASS — all five tests green.

- [ ] **Step 6: Pin the Storage emulator port**

Add to `firebase.json` `emulators` block:
```json
"storage": { "port": 9199 }
```

- [ ] **Step 7: Commit**

```bash
git add packages/firebase firebase.json
git commit -m "feat(firebase): @luminova/firebase client singleton with App Check"
```

---

## Task 4: Env templates

**Files:**
- Create: `apps/spotlight/.env.local.example`
- Create: `apps/backstage/.env.local.example`

- [ ] **Step 1: Write `apps/spotlight/.env.local.example`**

Fill `VITE_FIREBASE_*` from the spotlight web-app sdkconfig captured in Task 1.
```bash
# spotlight web app (appId ...8b4acf) — public site
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=jci-oriente.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=jci-oriente
VITE_FIREBASE_STORAGE_BUCKET=jci-oriente.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
# App Check (reCAPTCHA v3) — paste real key when created; leave blank to disable locally
VITE_APPCHECK_SITE_KEY=
VITE_APPCHECK_DEBUG_TOKEN=
# Emulators
VITE_FIREBASE_EMULATOR_ENABLED=true
```

- [ ] **Step 2: Write `apps/backstage/.env.local.example`**

Fill `VITE_FIREBASE_*` from the backstage web-app sdkconfig captured in Task 1.
```bash
# backstage web app (new appId) — admin dashboard
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=jci-oriente.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=jci-oriente
VITE_FIREBASE_STORAGE_BUCKET=jci-oriente.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_APPCHECK_SITE_KEY=
VITE_APPCHECK_DEBUG_TOKEN=
VITE_FIREBASE_EMULATOR_ENABLED=true
```

- [ ] **Step 3: Confirm `.env.local` is gitignored**

Run:
```bash
git check-ignore apps/spotlight/.env.local apps/backstage/.env.local
```
Expected: both paths echoed (ignored). If not, add `.env.local` to root `.gitignore`
and commit that change.

- [ ] **Step 4: Commit**

```bash
git add apps/spotlight/.env.local.example apps/backstage/.env.local.example
git commit -m "chore(firebase): per-app env templates"
```

---

## Task 5: Beacon functions scaffold

**Files:**
- Modify: `apps/beacon/package.json`
- Modify: `apps/beacon/src/index.ts`
- Modify: `apps/beacon/tsconfig.json`

> Helpers from `apps/beacon/CLAUDE.md` are intentionally stubbed (typed signatures,
> `throw new Error("not implemented")` bodies). Real point logic is a separate feature.

- [ ] **Step 1: Add functions dependencies**

Invoke `secure-dep-vetting` for `firebase-admin` and `firebase-functions`, then:
```bash
pnpm --filter beacon add firebase-admin@<vetted> firebase-functions@<vetted>
```

- [ ] **Step 2: Reconcile the build to emit JS**

Edit `apps/beacon/package.json`:
- Add `"main": "lib/index.js"`.
- Change `"build": "tsc --noEmit"` to `"build": "tsc"`.
- Keep `"typecheck": "tsc --noEmit"`.

Edit `apps/beacon/tsconfig.json` compilerOptions to emit:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "lib",
    "rootDir": "src",
    "noEmit": false,
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```
Add `lib/` to root `.gitignore` if not already ignored.

- [ ] **Step 3: Update the existing test to match the scaffold exports**

`apps/beacon/src/index.test.ts` currently only imports `FUNCTION_NAME` (which already
exists). Replace its body to also import the new exports so the test genuinely fails
until the scaffold is written:
```ts
import { describe, expect, it } from "vitest";
import { FUNCTION_NAME, awardPoints, getMemberPointsRef } from "./index";

describe("beacon", () => {
  it("exposes the awardPoints function name", () => {
    expect(FUNCTION_NAME).toBe("awardPoints");
  });

  it("exports the awardPoints trigger", () => {
    expect(awardPoints).toBeDefined();
  });

  it("exports a getMemberPointsRef helper", () => {
    expect(typeof getMemberPointsRef).toBe("function");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run:
```bash
pnpm --filter beacon test
```
Expected: FAIL — `awardPoints` and `getMemberPointsRef` are not exported by `./index`
yet (import resolves to `undefined`).

- [ ] **Step 5: Write the `awardPoints` scaffold**

Replace `apps/beacon/src/index.ts`. Admin init is lazy (inside `db()`) so importing the
module in a unit test has no side effects:
```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

export const FUNCTION_NAME = "awardPoints";

function db() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

export function getMemberPointsRef(
  year: string,
  month: string,
  eventId: string,
): DocumentReference {
  return db().doc(`memberPoints/${year}/${month}/${eventId}`);
}

export const awardPoints = onDocumentWritten("events/{id}", async () => {
  throw new Error("not implemented");
});
```

> The `awardPoints` handler arg is unused in the scaffold. ESLint may flag it — resolve
> per repo lint config (e.g. omit the param entirely as shown, or prefix with `_`). Do not
> disable rules globally. `extractEventData` and the other helpers from
> `apps/beacon/CLAUDE.md` are added with the real `awardPoints` feature, not here.

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
pnpm --filter beacon test
```
Expected: PASS.

- [ ] **Step 7: Verify the build emits**

Run:
```bash
pnpm --filter beacon build
ls apps/beacon/lib/index.js
```
Expected: `tsc` succeeds and `apps/beacon/lib/index.js` exists.

- [ ] **Step 8: Commit**

```bash
git add apps/beacon
git commit -m "feat(beacon): awardPoints onDocumentWritten scaffold + emit build"
```

> **Deferred risk (document, do not solve now):** Firebase Functions deploy does not
> natively understand pnpm workspaces. Packaging `apps/beacon` for `firebase deploy
> --only functions` may need an isolate/bundle step. Out of scope for this scaffold;
> revisit when first deploying functions.

---

## Task 6: Emulator seed script

**Files:**
- Create: `tools/scripts/seed-emulator.mjs`

- [ ] **Step 1: Write the seed script**

`tools/scripts/seed-emulator.mjs`:
```js
// Seeds the Firestore emulator with sample data for local development.
// Usage: FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 node tools/scripts/seed-emulator.mjs
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: FIRESTORE_EMULATOR_HOST is not set.");
  process.exit(1);
}

initializeApp({ projectId: "jci-oriente" });
const db = getFirestore();

const members = [
  { id: "m1", name: "Ana Rivas", active: true },
  { id: "m2", name: "Bruno Paz", active: true },
];
const pointRules = [
  { id: "pr1", type: "conference", role: "Director", points: 10 },
  { id: "pr2", type: "conference", role: "Participant", points: 2 },
];
const events = [
  {
    id: "e1",
    type: "conference",
    name: "Kickoff",
    startDate: "2026-01-15",
    director: "m1",
    coDirectorIds: [],
    collaboratorIds: [],
    participantIds: ["m2"],
  },
];

async function seed() {
  for (const m of members) await db.doc(`members/${m.id}`).set(m);
  for (const r of pointRules) await db.doc(`pointRules/${r.id}`).set(r);
  for (const e of events) await db.doc(`events/${e.id}`).set(e);
  console.log("Seeded members, pointRules, events.");
}

seed().then(() => process.exit(0));
```

- [ ] **Step 2: Verify the guard refuses to run against prod**

Run (without the emulator host set):
```bash
node tools/scripts/seed-emulator.mjs
```
Expected: prints "Refusing to run: FIRESTORE_EMULATOR_HOST is not set." and exits 1.

- [ ] **Step 3: Verify seeding against the emulator**

Start the Firestore emulator in another shell (`firebase emulators:start --only firestore`),
then run:
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 node tools/scripts/seed-emulator.mjs
```
Expected: "Seeded members, pointRules, events." Confirm docs in the Emulator UI
(http://127.0.0.1:4100).

- [ ] **Step 4: Commit**

```bash
git add tools/scripts/seed-emulator.mjs
git commit -m "chore(firebase): emulator seed script with prod guard"
```

---

## Task 7: Production wipe (human-gated)

**Files:**
- Create: `tools/scripts/wipe-prod.md`

> This task is destructive and irreversible. It is NOT auto-executed by a subagent. The
> human operator runs each command after confirming the target project and bucket.

- [ ] **Step 1: Write the runbook**

`tools/scripts/wipe-prod.md`:
```markdown
# Production Wipe Runbook (jci-oriente)

DESTRUCTIVE. Run only with intent. No backups are kept.

## 1. Confirm the active project
    firebase use jci-oriente
    firebase projects:list   # verify jci-oriente is the target

## 2. Identify the Storage bucket
    gcloud storage buckets list --project jci-oriente
    # or read storageBucket from the web-app sdkconfig

## 3. Wipe Firestore (all collections)
    firebase firestore:delete --all-collections --project jci-oriente
    # CLI prompts for confirmation; type the confirmation it asks for.

## 4. Wipe Storage objects (keeps the bucket, deletes contents)
    gcloud storage rm --recursive "gs://<BUCKET>/**" --project jci-oriente

## 5. Verify
    firebase firestore:databases:list --project jci-oriente
    gcloud storage ls "gs://<BUCKET>"   # expect empty
```

- [ ] **Step 2: Execute the wipe (operator-gated)**

Walk the operator through `tools/scripts/wipe-prod.md` interactively. Before each
destructive command: print the exact command and the resolved bucket name, and wait for
an explicit "yes". Do not batch.

- [ ] **Step 3: Commit the runbook**

```bash
git add tools/scripts/wipe-prod.md
git commit -m "docs(firebase): production wipe runbook"
```

---

## Task 8: Documentation + console checklist

**Files:**
- Modify: `docs/firebase-setup.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Update `docs/firebase-setup.md`**

Apply these edits:
- Hosting table: keep `jcioriente` (spotlight) and `jcioriente-backstage` (backstage).
- Add a "Web Apps" subsection documenting the two registrations and that each app reads
  its own `appId` from its `.env.local`.
- Add an "App Check" subsection: reCAPTCHA v3, debug token for local dev, enforcement
  left OFF until keys are configured.
- Replace the manual Auth section with the console checklist below.
- Add a "Seeding the emulator" subsection pointing at `tools/scripts/seed-emulator.mjs`.

Console checklist to embed:
```markdown
## Console Checklist (manual, one-time)

1. Authentication → Sign-in method → enable **Email/Password**. No other providers.
2. App Check:
   - Register a reCAPTCHA v3 site key for each web app (spotlight, backstage).
   - Paste each key into the matching app's `.env.local` as `VITE_APPCHECK_SITE_KEY`.
   - For local dev, copy the debug token printed in the browser console into
     `VITE_APPCHECK_DEBUG_TOKEN` and register it under App Check → Apps → Manage debug tokens.
   - Leave enforcement OFF until both apps send valid tokens in production.
3. Authentication → Users → create the initial admin user (email/password).
```

- [ ] **Step 2: Update `docs/architecture.md`**

- Replace the single-web-app description with two web-app registrations (spotlight,
  backstage) sharing one project/DB.
- Note spotlight ships no Firebase by default and dynamic-imports `@luminova/firebase`
  on dynamic routes; backstage imports at boot.
- Update the `@luminova/firebase` package description to "memoized client singleton with
  App Check + emulator wiring" (it is not shadcn-style copied source).

- [ ] **Step 3: Commit**

```bash
git add docs/firebase-setup.md docs/architecture.md
git commit -m "docs(firebase): two web apps, App Check, lazy-firebase, seeding"
```

---

## Final verification

- [ ] `firebase emulators:start` boots Auth (4030), Firestore (4010), Functions (4020),
  Hosting (4000), UI (4100), Storage (9199) with no errors.
- [ ] `pnpm --filter @luminova/firebase test` passes.
- [ ] `pnpm --filter @luminova/firestore-rules-tests test` passes (emulator running).
- [ ] `pnpm --filter beacon build` emits `apps/beacon/lib/index.js`.
- [ ] `pnpm -w typecheck` and `pnpm -w lint` pass.
- [ ] `pnpm pr-tests` passes (format, ci, knip, audit).
- [ ] Production Firestore + Storage confirmed empty (Task 7).
- [ ] `/security-review` run on the diff (rules + functions scaffold trigger it), plus
  `firestore-security-reviewer` and `firebase-functions-reviewer` subagents.

## Post-plan follow-ups (not in this plan)
- Wire `@luminova/firebase` into backstage boot and spotlight dynamic routes.
- Implement real `awardPoints` logic (separate feature + TDD).
- Resolve pnpm-workspace functions deploy packaging.
- Turn App Check enforcement ON once production keys flow.
