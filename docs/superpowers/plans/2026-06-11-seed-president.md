# Seed an initial President — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed a durable initial **Presidente** (who is Admin via the Presidente cargo) once — fixed fake data for dev, interactive prompts for prod — surviving the `onMemberWritten` claims-sync trigger.

**Architecture:** A shared, env-agnostic core (`tools/scripts/lib/seed-president.mjs`) with pure, unit-tested helpers plus an admin-SDK orchestrator. The two existing seed scripts (`seed-emulator.mjs`, `seed-production.mjs`) call the core with env-specific creds. Durability comes from setting Admin **claims before** writing the member doc whose `positions.<term>.assignedBy` is the president's own uid — so the trigger's trust gate (which reads the assigner's live claims) keeps Admin.

**Tech Stack:** Node 24 ESM (`.mjs`), `firebase-admin` 13 (root dep), built-in `node:test` + `node:readline`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-11-seed-president-design.md`

---

## File Structure

- **Create** `tools/scripts/lib/cel-seed.mjs` — CEL catalog data mirror + `toPositionDoc`. Source of truth is the TS at `apps/backstage/src/features/positions/lib/cel-seed.ts`; this is a data copy (`.mjs` can't import TS).
- **Create** `tools/scripts/lib/seed-president.mjs` — pure helpers (`findPresidentPositionId`, `presidentClaims`, `buildPresidentMember`) + orchestrator `seedPresident` + `upsertAuthUser`.
- **Create** `tools/scripts/lib/seed-president.test.mjs` — `node:test` unit tests for the pure helpers.
- **Modify** `tools/scripts/seed-emulator.mjs` — promote `m1` to the durable president via `seedPresident`.
- **Modify** `tools/scripts/seed-production.mjs` — `readline` prompts (masked password) + validation → `seedPresident`.
- **Modify** `package.json` (root) — add `test:seed` script; append to `pr-tests`.

---

### Task 1: Pure helpers + CEL data mirror (unit-tested)

**Recommended subagent model:** sonnet (routine, well-specified pure functions + tests).

**Files:**
- Create: `tools/scripts/lib/cel-seed.mjs`
- Create: `tools/scripts/lib/seed-president.mjs` (pure-helpers section only this task)
- Test: `tools/scripts/lib/seed-president.test.mjs`

- [ ] **Step 1: Write the CEL data mirror**

Create `tools/scripts/lib/cel-seed.mjs`:

```js
// Data mirror of apps/backstage/src/features/positions/lib/cel-seed.ts (the TS
// source of truth — keep in sync). `.mjs` ops scripts cannot import the TS, so
// the fixed CEL catalog is duplicated here as plain data. CEL cargos are stable.
export const CEL_SEED = [
  { title: "Presidente", titleFemale: "Presidenta", category: "CEL", grants: ["Admin"], term: null, description: "Dirige el capítulo; acceso total a la plataforma." },
  { title: "Vicepresidente Ejecutivo", titleFemale: "Vicepresidenta Ejecutiva", category: "CEL", grants: ["ExecutiveCommittee", "Membership"], term: null, description: "Coordina la junta directiva y la membresía." },
  { title: "Vicepresidente de Área", titleFemale: "Vicepresidenta de Área", category: "CEL", grants: ["ExecutiveCommittee", "Membership"], term: null, description: "Supervisa las direcciones de su área." },
  { title: "Secretario", titleFemale: "Secretaria", category: "CEL", grants: ["Membership"], term: null, description: "Actas, registros y gestión de miembros." },
  { title: "Tesorero", titleFemale: "Tesorera", category: "CEL", grants: ["Treasury"], term: null, description: "Finanzas, cuotas y pagos del capítulo." },
  { title: "Asesor Legal", titleFemale: "Asesora Legal", category: "CEL", grants: ["ExecutiveCommittee"], term: null, description: "Asesora legalmente al comité ejecutivo." },
  { title: "Pasado Presidente", titleFemale: "Pasada Presidenta", category: "CEL", grants: ["ExecutiveCommittee"], term: null, description: "Acompaña la transición y asesora a la directiva." },
  { title: "Asesor Presidencial", titleFemale: "Asesora Presidencial", category: "CEL", grants: ["ExecutiveCommittee"], term: null, description: "Asesora a la presidencia." },
];

// Mirror of toPositionCreateDoc in position-mapper.ts.
export function toPositionDoc(entry) {
  return { ...entry, active: true, deletedAt: null };
}
```

- [ ] **Step 2: Write the failing unit tests**

Create `tools/scripts/lib/seed-president.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { CEL_SEED } from "./cel-seed.mjs";
import {
  findPresidentPositionId,
  presidentClaims,
  buildPresidentMember,
} from "./seed-president.mjs";

test("CEL mirror has exactly one Admin-granting Presidente", () => {
  const admins = CEL_SEED.filter((p) => p.grants.includes("Admin"));
  assert.equal(admins.length, 1);
  assert.equal(admins[0].title, "Presidente");
});

test("findPresidentPositionId returns the active CEL position granting Admin", () => {
  const positions = [
    { id: "x", category: "CEL", grants: ["Membership"], active: true },
    { id: "pres", category: "CEL", grants: ["Admin"], active: true },
    { id: "old", category: "CEL", grants: ["Admin"], active: false },
  ];
  assert.equal(findPresidentPositionId(positions), "pres");
});

test("findPresidentPositionId throws when no active CEL grants Admin", () => {
  assert.throws(
    () => findPresidentPositionId([{ id: "a", category: "CEL", grants: ["Treasury"], active: true }]),
    /grants Admin/,
  );
});

test("presidentClaims includes Member and Admin", () => {
  assert.deepEqual(presidentClaims(), { roles: ["Member", "Admin"] });
});

test("buildPresidentMember self-assigns the cargo for the term", () => {
  const m = buildPresidentMember({
    uid: "u1", name: "Ana", email: "a@jci.cc", gender: "Femenino",
    term: "2026", cargoId: "pres", joinDate: "JD", birthdate: "BD",
  });
  assert.equal(m.uid, "u1");
  assert.equal(m.status, "Activo");
  assert.equal(m.active, true);
  assert.equal(m.deletedAt, null);
  assert.equal(m.joinDate, "JD");
  assert.deepEqual(m.positions, {
    "2026": { cargoId: "pres", comisionIds: [], assignedBy: "u1" },
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `node --test tools/scripts/lib/seed-president.test.mjs`
Expected: FAIL — `Cannot find module './seed-president.mjs'` (file not created yet).

- [ ] **Step 4: Write the pure helpers**

Create `tools/scripts/lib/seed-president.mjs` with ONLY the pure section for now:

```js
const ADMIN_GRANT = "Admin";

/** The catalog id of the Presidente cargo — the active CEL position granting Admin. */
export function findPresidentPositionId(positions) {
  const match = positions.find(
    (p) =>
      p.active !== false &&
      p.category === "CEL" &&
      Array.isArray(p.grants) &&
      p.grants.includes(ADMIN_GRANT),
  );
  if (!match) {
    throw new Error("No active CEL position grants Admin; cannot seed president.");
  }
  return match.id;
}

/** Claims the president must hold so the self-assigned Admin cargo stays trusted
 *  on every onMemberWritten re-derivation. Matches what the trigger computes. */
export function presidentClaims() {
  return { roles: ["Member", "Admin"] };
}

/** Firestore member-doc body for the seeded president. `joinDate`/`birthdate`
 *  are caller-provided Timestamps (kept opaque so this stays unit-testable). */
export function buildPresidentMember({ uid, name, email, gender, term, cargoId, joinDate, birthdate }) {
  return {
    name,
    email,
    uid,
    gender,
    phone: "",
    profession: "",
    joinDate,
    birthdate,
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    isPastPresident: false,
    positions: { [term]: { cargoId, comisionIds: [], assignedBy: uid } },
    active: true,
    deletedAt: null,
  };
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `node --test tools/scripts/lib/seed-president.test.mjs`
Expected: PASS — 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tools/scripts/lib/cel-seed.mjs tools/scripts/lib/seed-president.mjs tools/scripts/lib/seed-president.test.mjs
git commit -m "feat(seed): pure president-seed helpers + CEL data mirror"
```

---

### Task 2: Orchestrator `seedPresident` + auth upsert

**Recommended subagent model:** opus (the claims-before-member-write ordering and the once-guard are the security-critical, subtle parts).

**Files:**
- Modify: `tools/scripts/lib/seed-president.mjs` (append orchestrator + auth helper)

- [ ] **Step 1: Append the auth upsert + orchestrator**

Add to the TOP of `tools/scripts/lib/seed-president.mjs` (imports):

```js
import { Timestamp } from "firebase-admin/firestore";
import { CEL_SEED, toPositionDoc } from "./cel-seed.mjs";
```

Append at the END of the file:

```js
/** Create the Auth user, or reuse + reset password if the email/uid already
 *  exists. Returns the resolved uid. `uid` is optional (dev pins a fixed uid). */
export async function upsertAuthUser(auth, { email, password, uid }) {
  try {
    const user = await auth.createUser(uid ? { uid, email, password } : { email, password });
    return user.uid;
  } catch (error) {
    if (error?.code !== "auth/email-already-exists" && error?.code !== "auth/uid-already-exists") {
      throw error;
    }
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    return user.uid;
  }
}

/**
 * Seed a durable Presidente (Admin via cargo), idempotently.
 *
 * Order is load-bearing: claims are set BEFORE the member doc is written, so that
 * when onMemberWritten fires it reads the assigner's (self) live claims, sees
 * Admin, and honors the self-assigned power grant. Reversing the order would let
 * the trigger drop Admin on the first re-derivation.
 *
 * @param {object} a
 * @param {FirebaseFirestore.Firestore} a.db
 * @param {import('firebase-admin/auth').Auth} a.auth
 * @param {{name,email,password,gender,uid?}} a.president
 * @param {string} a.term            e.g. "2026"
 * @param {FirebaseFirestore.Timestamp} a.joinDate
 * @param {FirebaseFirestore.Timestamp} a.birthdate
 * @param {string} [a.memberId]      pin the member doc id (dev: "m1")
 * @param {boolean} [a.force]        re-seed past the once-guard (dev only)
 */
export async function seedPresident({ db, auth, president, term, joinDate, birthdate, memberId, force = false }) {
  const bootstrapRef = db.doc("meta/bootstrap");
  const bootstrap = await bootstrapRef.get();
  if (bootstrap.exists && !force) {
    return { skipped: true, reason: "already-seeded", presidentUid: bootstrap.get("presidentUid") };
  }

  const posCol = db.collection("positions");
  const probe = await posCol.limit(1).get();
  if (probe.empty) {
    const batch = db.batch();
    for (const entry of CEL_SEED) batch.set(posCol.doc(), toPositionDoc(entry));
    await batch.commit();
  }
  const snap = await posCol.get();
  const positions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cargoId = findPresidentPositionId(positions);

  const uid = await upsertAuthUser(auth, president);

  // Claims FIRST — see the order note above.
  await auth.setCustomUserClaims(uid, presidentClaims());

  const id = memberId ?? db.collection("members").doc().id;
  await db.doc(`members/${id}`).set(
    buildPresidentMember({ uid, name: president.name, email: president.email, gender: president.gender, term, cargoId, joinDate, birthdate }),
    { merge: true },
  );

  await bootstrapRef.set({ seededAt: Timestamp.now(), presidentUid: uid });

  return { skipped: false, presidentUid: uid, memberId: id, cargoId };
}
```

- [ ] **Step 2: Re-run unit tests (pure helpers still pass; orchestrator untested here)**

Run: `node --test tools/scripts/lib/seed-president.test.mjs`
Expected: PASS — 5 tests still pass (the new `firebase-admin/firestore` import resolves from the root dep; orchestrator is covered by the emulator e2e in Task 6).

- [ ] **Step 3: Commit**

```bash
git add tools/scripts/lib/seed-president.mjs
git commit -m "feat(seed): durable seedPresident orchestrator + auth upsert"
```

---

### Task 3: Wire the dev seed (`seed-emulator.mjs`)

**Recommended subagent model:** sonnet (mechanical wiring into an existing script).

**Files:**
- Modify: `tools/scripts/seed-emulator.mjs`

- [ ] **Step 1: Import the core and Timestamp helper**

At the top of `tools/scripts/seed-emulator.mjs`, alongside the existing imports, add:

```js
import { seedPresident } from "./lib/seed-president.mjs";
```

(`getAuth`, `Timestamp`, `getFirestore` are already imported.)

- [ ] **Step 2: Replace the `seedAdminUser()` call with `seedPresident`**

The current `ADMIN` constant and `seedAdminUser()` function set claims-only Admin on uid `admin` linked to `m1` — the buggy path. Keep the `ADMIN` constant values but route through the durable core.

In `seed()`, REPLACE the line:

```js
  await seedAdminUser();
```

with:

```js
  const result = await seedPresident({
    db,
    auth: getAuth(),
    president: {
      name: "Ana Rivas",
      email: "admin@jci.cc",
      password: "Secret1",
      gender: "Femenino",
      uid: "admin",
    },
    term: TERM,
    joinDate: ts("2021-03-01T00:00:00Z"),
    birthdate: ts("1992-07-01T00:00:00Z"),
    memberId: "m1",
    force: true,
  });
  console.log(`President: admin@jci.cc / Secret1 (Admin via cargo ${result.cargoId}, uid ${result.presidentUid}).`);
```

Then DELETE the now-unused `seedAdminUser` function and the `ADMIN` constant. Also remove the `...(m.id === "m1" ? { uid: ADMIN.uid } : {})` spread in the `members` map (the president's `uid` is now set by `seedPresident`'s merge) — change that line to drop the spread:

```js
}).map((m) => ({
  ...m,
  phone: "",
```

(Guard: the Auth-emulator skip warning in `seedAdminUser` is dropped because `pnpm seed:emulator` always sets `FIREBASE_AUTH_EMULATOR_HOST`. If `getAuth()` is unreachable the script will throw loudly, which is acceptable for a dev seed.)

- [ ] **Step 3: Lint the changed script**

Run: `pnpm exec prettier --check tools/scripts/seed-emulator.mjs tools/scripts/lib/`
Expected: PASS (or run `pnpm exec prettier --write` on those paths, then re-check).

- [ ] **Step 4: Commit**

```bash
git add tools/scripts/seed-emulator.mjs
git commit -m "feat(seed): dev seed creates durable president (admin@jci.cc), fixes Admin-wipe"
```

---

### Task 4: Prod prompts + validation (`seed-production.mjs`)

**Recommended subagent model:** opus (masked stdin + re-prompt validation loop is fiddly and easy to get subtly wrong).

**Files:**
- Modify: `tools/scripts/seed-production.mjs`

- [ ] **Step 1: Replace the env-var admin with prompted president**

Rewrite `tools/scripts/seed-production.mjs` to keep the emulator-env hard guard, prompt for the president's details, and call `seedPresident`. Full file:

```js
// Bootstraps the PRODUCTION president (a real member who is Admin via the
// Presidente cargo) — ONCE. The Firebase console cannot set custom claims, so this
// admin-SDK script does it, then self-assigns the Admin cargo so the claims-sync
// trigger keeps Admin durably. A `meta/bootstrap` doc makes re-runs a no-op.
//
// Requires Application Default Credentials for the prod project:
//   gcloud auth application-default login
//   (or GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json)
//
// Run:  pnpm seed:production
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createInterface } from "node:readline/promises";
import { seedPresident } from "./lib/seed-president.mjs";

if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "Refusing to run: emulator env vars are set (FIREBASE_AUTH_EMULATOR_HOST / " +
      "FIRESTORE_EMULATOR_HOST). This script targets PRODUCTION — unset them and retry.",
  );
  process.exit(1);
}

const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "jci-oriente";
const TERM = String(new Date().getUTCFullYear());

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(label, validate) {
  for (;;) {
    const value = (await rl.question(`${label}: `)).trim();
    const error = validate(value);
    if (!error) return value;
    console.error(`  ✗ ${error}`);
  }
}

// Masked prompt: mute the echo while the user types the password.
async function askHidden(label, validate) {
  for (;;) {
    process.stdout.write(`${label}: `);
    rl.output.muted = true;
    const value = (await rl.question("")).trim();
    rl.output.muted = false;
    process.stdout.write("\n");
    const error = validate(value);
    if (!error) return value;
    console.error(`  ✗ ${error}`);
  }
}
// Intercept writes so askHidden suppresses the echoed characters.
const realWrite = rl.output.write.bind(rl.output);
rl.output.write = (chunk, ...rest) => (rl.output.muted ? true : realWrite(chunk, ...rest));

const nonEmpty = (v) => (v.length === 0 ? "required" : null);
const emailOk = (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "invalid email");
const genderOk = (v) => (["Masculino", "Femenino"].includes(v) ? null : "type Masculino or Femenino");
const passwordOk = (v) =>
  v.length >= 6 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v)
    ? null
    : "min 6 chars with a lowercase, an uppercase, and a digit";

async function main() {
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const auth = getAuth();

  const existing = await db.doc("meta/bootstrap").get();
  if (existing.exists) {
    console.log(
      `Already seeded (president uid ${existing.get("presidentUid")}). ` +
        "Manage members and cargos from backstage. Nothing to do.",
    );
    rl.close();
    process.exit(0);
  }

  console.log(`Seeding the initial president for project ${projectId} (term ${TERM}).\n`);
  const name = await ask("President full name", nonEmpty);
  const email = await ask("President email", emailOk);
  const gender = await ask("Gender (Masculino/Femenino)", genderOk);
  const password = await askHidden("Temp password", passwordOk);

  const result = await seedPresident({
    db,
    auth,
    president: { name, email, password, gender },
    term: TERM,
    joinDate: Timestamp.now(),
    birthdate: Timestamp.now(),
  });

  rl.close();
  console.log(
    `\n✓ Seeded president ${email} (Admin via cargo ${result.cargoId}, uid ${result.presidentUid}).\n` +
      `Log in to backstage with ${email} and the password you set, then change it from the Firebase console.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Lint the changed script**

Run: `pnpm exec prettier --check tools/scripts/seed-production.mjs`
Expected: PASS (run `--write` then re-check if needed).

- [ ] **Step 3: Syntax/smoke check (no creds needed — exits on the env guard or ADC)**

Run: `FIRESTORE_EMULATOR_HOST=127.0.0.1:9 node tools/scripts/seed-production.mjs`
Expected: prints the "Refusing to run: emulator env vars are set" guard and exits 1 — proves the module parses and the guard fires.

- [ ] **Step 4: Commit**

```bash
git add tools/scripts/seed-production.mjs
git commit -m "feat(seed): prod seed prompts for president details, once-only"
```

---

### Task 5: Wire `test:seed` into scripts + pr-tests

**Recommended subagent model:** haiku (trivial JSON edit + one command).

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add the script and fold into pr-tests**

In root `package.json` `scripts`, add:

```json
    "test:seed": "node --test tools/scripts/lib/",
```

And change the existing `pr-tests` line to append `test:seed`:

```json
    "pr-tests": "pnpm format && turbo run ci && pnpm knip && pnpm audit --audit-level=high && pnpm test:seed",
```

- [ ] **Step 2: Run it**

Run: `pnpm test:seed`
Expected: PASS — 5 tests pass (node:test discovers `seed-president.test.mjs`).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(seed): run seed helper unit tests in pr-tests"
```

---

### Task 6: Emulator e2e — durability verification (controller-run)

**Recommended subagent model:** none — run by the controller in the main session, NOT a subagent (needs the user's already-running emulators; an agent must not start emulators and race them).

**Files:** none (verification only)

- [ ] **Step 1: Ensure emulators are running**

The user runs `firebase emulators:start` (Auth :4030, Firestore :4010, Functions :4020) if not already up. Do NOT start them from an agent.

- [ ] **Step 2: Run the dev seed**

Run: `pnpm seed:emulator`
Expected: logs include `President: admin@jci.cc / Secret1 (Admin via cargo <id>, uid admin).`

- [ ] **Step 3: Assert claims + durability via a script**

Run this one-off against the emulator (it sets claims, then simulates a member-doc re-write and re-reads claims):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:4030 node --input-type=module -e '
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
initializeApp({ projectId: "jci-oriente" });
const auth = getAuth(), db = getFirestore();
const before = (await auth.getUser("admin")).customClaims;
console.log("claims:", JSON.stringify(before));
if (!before?.roles?.includes("Admin")) throw new Error("FAIL: no Admin claim");
// touch the member doc to fire onMemberWritten (if functions emulator is up)
await db.doc("members/m1").update({ totalPoints: 99 });
await new Promise((r) => setTimeout(r, 2500));
const after = (await auth.getUser("admin")).customClaims;
console.log("claims after re-write:", JSON.stringify(after));
if (!after?.roles?.includes("Admin")) throw new Error("FAIL: Admin wiped by trigger");
console.log("PASS: Admin durable across member re-write");
process.exit(0);
'
```

Expected: `PASS: Admin durable across member re-write`. (If the Functions emulator is not running, the trigger never fires and the check trivially passes — note that in the result and re-run with functions up for a true durability assertion.)

- [ ] **Step 4: Assert the once-guard (prod path) refuses a second run**

Re-run `pnpm seed:emulator` — it uses `force: true`, so it re-seeds (expected). For the prod once-guard, confirm `meta/bootstrap` exists:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 node --input-type=module -e '
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp({ projectId: "jci-oriente" });
const d = await (getFirestore().doc("meta/bootstrap")).get();
console.log("meta/bootstrap exists:", d.exists, JSON.stringify(d.data()));
process.exit(d.exists ? 0 : 1);
'
```

Expected: `meta/bootstrap exists: true ...`.

- [ ] **Step 5: Log in via backstage (manual)**

Start the app (`pnpm dev` or use the running stack), log in with `admin@jci.cc` / `Secret1`, open `/positions` (catalog seeded), open a member → confirm the Cargo/Comisión selects populate and the president shows the Presidente cargo. Record the outcome.

---

## Post-implementation gates (run after Task 6)

1. **`/simplify`** on the diff — quality cleanup of the new scripts.
2. **`/code-review`** on the branch diff.
3. **`firebase-functions-reviewer`** subagent — the seed is claims-adjacent ops code; verify admin-SDK-only, idempotency, no client SDK, error handling.
4. **`/security-review`** on the diff — custom-claims trust boundary; confirm the once-guard, the claims-before-member-write ordering, and that no secret is committed.
5. Open the PR (`gh pr create`) with the template; run `pnpm pr-tests`.

---

## Self-Review (spec coverage)

- Real president-member with Presidente cargo → Tasks 1–2 (`buildPresidentMember`, orchestrator). ✓
- Dev fixed fake data `admin@jci.cc`/`Secret1` → Task 3. ✓
- Prod interactive prompts for real info → Task 4. ✓
- Once only (`meta/bootstrap` guard) → Task 2 (orchestrator) + Task 4 (prod early-exit) + Task 6 Step 4. ✓
- Durability (claims before member write) → Task 2 ordering + Task 6 Step 3 assertion. ✓
- No committed secret → Task 4 uses prompts, no `config.yml`. ✓
- Unit tests via `node --test` + wired into pr-tests → Tasks 1 & 5. ✓
- Fixes the existing dev Admin-wipe bug → Task 3 (m1 now has the Presidente cargo). ✓
