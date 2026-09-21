// One-shot e2e for issueMemberInvite, against the running emulator suite.
// Uses firebase-admin (setup/verify) + the Auth-emulator REST (mint an Admin ID
// token) + fetch to the callable endpoint — no client SDK (not a root dep).
// Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:4010 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:4030 \
//      node tools/scripts/e2e-issue-invite.mjs
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Refusing to run: emulator host envs are not set.");
  process.exit(1);
}
const projectId = process.env.GCLOUD_PROJECT ?? "jci-oriente";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FN_URL = `http://127.0.0.1:4020/${projectId}/us-central1/issueMemberInvite`;

initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

const ADMIN = { email: "e2e-admin@jci.test", password: "e2e-admin-pw" };
const MEMBER_ID = "e2e_provision_member";
const MEMBER_EMAIL = "e2e-provision@jci.test";

async function ensureAdmin() {
  const user = await auth.getUserByEmail(ADMIN.email).catch(() => null);
  const uid = user ? user.uid : (await auth.createUser(ADMIN)).uid;
  await auth.setCustomUserClaims(uid, { roles: ["Admin"] });
}

async function resetTarget() {
  await db.doc(`members/${MEMBER_ID}`).set({
    name: "E2E Provision",
    email: MEMBER_EMAIL,
    role: "Miembro",
    phone: "",
    profession: "",
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
  });
  const existing = await auth.getUserByEmail(MEMBER_EMAIL).catch(() => null);
  if (existing) await auth.deleteUser(existing.uid);
}

async function adminIdToken() {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ADMIN, returnSecureToken: true }),
    },
  );
  const body = await res.json();
  if (!body.idToken) throw new Error(`sign-in failed: ${JSON.stringify(body)}`);
  return body.idToken;
}

async function callIssueInvite(memberId, idToken) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data: { memberId } }),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  await ensureAdmin();
  await resetTarget();

  // 1) Guard: unauthenticated caller is rejected.
  const guard = await callIssueInvite(MEMBER_ID, null);
  if (!guard.body.error) throw new Error("guard FAIL: unauthenticated call was not rejected");
  console.log("✓ guard: unauthenticated rejected:", guard.body.error.status);

  // 2) Admin success path.
  const token = await adminIdToken();
  const ok = await callIssueInvite(MEMBER_ID, token);
  if (!ok.body.result) throw new Error(`callable FAIL: ${JSON.stringify(ok.body)}`);
  console.log("✓ callable result:", JSON.stringify(ok.body.result));

  // 3) Verify side effects.
  const member = (await db.doc(`members/${MEMBER_ID}`).get()).data();
  const provisioned = await auth.getUserByEmail(MEMBER_EMAIL);
  const pass =
    member?.uid === provisioned.uid &&
    Array.isArray(provisioned.customClaims?.roles) &&
    provisioned.customClaims.roles.includes("Member") &&
    // The token is the credential now — 43 base64url chars, minted fresh each call.
    /^[A-Za-z0-9_-]{43}$/.test(ok.body.result.token ?? "") &&
    typeof ok.body.result.expiresAt === "number" &&
    ok.body.result.replacedPreviousLink === false &&
    // and the projection the operator surfaces read
    member?.invite?.status === "pending" &&
    member?.invite?.tokenHash?.length === 64;

  console.log("member.uid:", member?.uid, "claims:", JSON.stringify(provisioned.customClaims));
  if (!pass) throw new Error("verify FAIL: uid / Member claim / token / projection incorrect");

  // 4) Re-issue reuses the uid AND revokes the previous link.
  const firstHash = member.invite.tokenHash;
  const again = await callIssueInvite(MEMBER_ID, token);
  const member2 = (await db.doc(`members/${MEMBER_ID}`).get()).data();
  if (!again.body.result || member2?.uid !== provisioned.uid) {
    throw new Error("idempotency FAIL: re-invite changed the uid");
  }
  if (again.body.result.replacedPreviousLink !== true) {
    throw new Error("revocation FAIL: re-issue did not report replacing the previous link");
  }
  const revoked = (await db.doc(`memberInvites/${firstHash}`).get()).data();
  if (revoked?.status !== "revoked") {
    throw new Error(`revocation FAIL: prior invite is ${revoked?.status}, expected revoked`);
  }
  if (member2.invite.tokenHash === firstHash) {
    throw new Error("revocation FAIL: projection still points at the revoked invite");
  }
  console.log("✓ re-issue reuses uid, revokes the prior link, re-points the projection");

  console.log(
    "\n✅ E2E PASS — issueMemberInvite links uid + Member claim + mints a revocable token",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("\n❌ E2E FAIL:", e.message ?? e);
  process.exit(1);
});
