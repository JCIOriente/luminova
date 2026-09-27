import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CallableOptions,
  CallableRequest,
  CallableResponse,
} from "firebase-functions/v2/https";
import { callableExports } from "./test-support/callable-exports.js";

// `enforceAppCheck` is not serialized into `__endpoint`, and `.run` skips firebase-functions'
// token checks, so neither shows whether a callable was DECLARED with it. This records the
// options each callable hands to `onCall` instead.
vi.mock("firebase-functions/v2/https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase-functions/v2/https")>();
  return {
    ...actual,
    onCall: (
      options: CallableOptions,
      handler: (request: CallableRequest, response?: CallableResponse) => unknown,
    ) => Object.assign(actual.onCall(options, handler), { declaredWith: options }),
  };
});

// Enforced where every caller attests: the invite pair (backstage's /invitacion) and
// issueMemberInvite (backstage's member pages). The other four are called by hand by the owner
// with an ID token and no App Check token, so enforcing there would lock those calls out.
const ENFORCED = ["describeInvite", "issueMemberInvite", "redeemInvite"];

async function declaredEnforcement(): Promise<Record<string, unknown>> {
  const entry: Record<string, unknown> = await import("./index.js");
  return Object.fromEntries(
    callableExports(entry).map(([name, fn]) => {
      // Cast: `callableExports` returns `unknown` per entry; `declaredWith` is a shape the
      // `onCall` mock above stamps on at test time, which the import's real type never declares.
      const { declaredWith } = fn as { declaredWith?: { enforceAppCheck?: unknown } };
      // Without this, a mock that stopped intercepting would read every callable as unenforced
      // and pass the emulator case vacuously.
      expect(declaredWith, name).toBeDefined();
      return [name, declaredWith?.enforceAppCheck];
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("which callables enforce App Check", () => {
  it("enforces on exactly the callables whose every caller attests, in production", async () => {
    expect(process.env.FUNCTIONS_EMULATOR).toBeUndefined();
    const declared = await declaredEnforcement();
    expect(Object.keys(declared).length).toBeGreaterThanOrEqual(7);
    // A floor on the count alone would pass if one of the three named callables vanished from
    // `index.ts`'s exports and an unrelated one appeared in its place. Pin the names too.
    for (const name of ENFORCED) {
      expect(Object.keys(declared), name).toContain(name);
    }
    for (const [name, enforce] of Object.entries(declared)) {
      expect(enforce === true, name).toBe(ENFORCED.includes(name));
    }
  });

  it("enforces on none of them under the emulator, where local dev sends no token", async () => {
    vi.stubEnv("FUNCTIONS_EMULATOR", "true");
    const declared = await declaredEnforcement();
    expect(Object.keys(declared).length).toBeGreaterThanOrEqual(7);
    for (const [name, enforce] of Object.entries(declared)) {
      expect(enforce === true, name).toBe(false);
    }
  });
});
