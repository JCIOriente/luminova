import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import {
  BYPASS_LOG_MESSAGE,
  assertTokenVerificationNotBypassed,
  tokenVerificationBypassEnabled,
} from "./token-verification-bypass.js";

/** The INSTALLED library's own gate, resolved by path rather than by specifier because
 *  firebase-functions does not export `./lib/common/debug.js` in its `exports` map.
 *
 *  This is the whole point of this file. Our predicate REPLICATES a decision made inside
 *  firebase-functions, and a unit test that only checks our predicate against our own
 *  expectations cannot detect the library changing underneath it — a version bump that adds a
 *  null guard, renames the feature key, or reads a different variable would leave every
 *  assertion green while the guard silently went inert or started over-firing. This repo has
 *  already paid for that exact shape once: the client⟷rules mirror drifted three times while its
 *  unit test never read `firestore.rules`, and the fix was a parity test. Same fix here. */
const require = createRequire(import.meta.url);
const PKG = "/firebase-functions/";
const main = require.resolve("firebase-functions");
const DEBUG_JS = main.slice(0, main.indexOf(PKG) + PKG.length) + "lib/common/debug.js";

/** The library's answer for the CURRENT environment.
 *
 *  `debug.js` captures `debugMode` at ITS OWN module load, so the CJS cache entry must be
 *  dropped for each case or every row after the first would read the first row's capture. */
function libraryWouldBypass(): boolean | "threw" {
  delete require.cache[DEBUG_JS];
  try {
    const debug = require(DEBUG_JS) as { isDebugFeatureEnabled(f: string): boolean };
    return debug.isDebugFeatureEnabled("skipTokenVerification");
  } catch {
    return "threw";
  }
}

/** Set the two keys exactly as a deployed service's environment would carry them. `undefined`
 *  means ABSENT — `vi.stubEnv` deletes the key rather than setting an empty string. */
function stubEnv(mode: string | undefined, features: string | undefined): void {
  vi.stubEnv("FIREBASE_DEBUG_MODE", mode);
  vi.stubEnv("FIREBASE_DEBUG_FEATURES", features);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete require.cache[DEBUG_JS];
});

describe("the predicate agrees with the REAL firebase-functions gate", () => {
  // Every row runs BOTH implementations against the same environment. A divergence is a
  // security-relevant event in one direction and an outage in the other, so neither is allowed
  // to appear silently.
  it.each([
    ["the live bypass", "true", JSON.stringify({ skipTokenVerification: true }), true],
    ["a truthy non-boolean value", "true", JSON.stringify({ skipTokenVerification: "yes" }), true],
    ["mode off", "false", JSON.stringify({ skipTokenVerification: true }), false],
    ['mode not the literal "true"', "1", JSON.stringify({ skipTokenVerification: true }), false],
    ["mode absent", undefined, JSON.stringify({ skipTokenVerification: true }), false],
    ["features unparseable", "true", "skipTokenVerification", false],
    ["features an empty string", "true", "", false],
    ["features absent", "true", undefined, false],
    ["features a bare number", "true", "42", false],
    ["features an array", "true", "[]", false],
    ["the key missing", "true", JSON.stringify({ somethingElse: true }), false],
    ["the key falsy", "true", JSON.stringify({ skipTokenVerification: false }), false],
    ["the key on the prototype", "true", '{"__proto__":{"skipTokenVerification":true}}', false],
  ])("agrees on %s", (_label, mode, features, expected) => {
    stubEnv(mode, features);
    expect(tokenVerificationBypassEnabled()).toBe(expected);
    // The library must reach the same verdict, or our guard is not guarding what we think.
    expect(libraryWouldBypass()).toBe(expected);
  });

  it("diverges on a literal `null` features value, and the divergence is FAIL-CLOSED", () => {
    // The one input where the two differ, asserted rather than left implicit — `debug.js` checks
    // only `typeof obj !== "object"`, so `JSON.parse("null")` passes that test and
    // `null["skipTokenVerification"]` throws a TypeError.
    stubEnv("true", "null");

    // The library THROWS. In `checkAppCheckToken` / `checkAuthToken` that throw is caught by
    // their own try/catch and degrades to "INVALID", i.e. the request is DENIED — so the
    // library's behaviour here is fail-closed and there is nothing for us to prevent.
    expect(libraryWouldBypass()).toBe("threw");

    // We return false rather than propagating, because propagating would 500 every guarded
    // call. Grants nothing, given the line above.
    expect(tokenVerificationBypassEnabled()).toBe(false);
    expect(() => assertTokenVerificationNotBypassed("f")).not.toThrow();
  });
});

describe("the refusal", () => {
  function refuse(fn = "f"): string {
    try {
      assertTokenVerificationNotBypassed(fn);
    } catch (err) {
      return err instanceof HttpsError ? err.code : "not-an-https-error";
    }
    return "no-throw";
  }

  it("throws `internal` while the bypass is live", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      stubEnv("true", JSON.stringify({ skipTokenVerification: true }));
      expect(refuse()).toBe("internal");
    } finally {
      error.mockRestore();
    }
  });

  it("carries NO tagged reason, so no dead string enters the @luminova/types contract", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      stubEnv("true", JSON.stringify({ skipTokenVerification: true }));
      let details: unknown = "never-threw";
      try {
        assertTokenVerificationNotBypassed("f");
      } catch (err) {
        details = (err as { details?: unknown }).details;
      }
      expect(details).toBeUndefined();
    } finally {
      error.mockRestore();
    }
  });

  it("does nothing when the bypass is inert", () => {
    stubEnv("false", JSON.stringify({ skipTokenVerification: true }));
    expect(refuse()).toBe("no-throw");
  });

  it("does NOT fire under the emulator, where the debug keys are the supported thing", async () => {
    // `UNDER_EMULATOR` is module scope, so this is the one case needing a re-import.
    vi.stubEnv("FUNCTIONS_EMULATOR", "true");
    stubEnv("true", JSON.stringify({ skipTokenVerification: true }));
    vi.resetModules();
    try {
      const fresh = await import("./token-verification-bypass.js");
      // The predicate still REPORTS the bypass — it describes the environment, not the policy.
      expect(fresh.tokenVerificationBypassEnabled()).toBe(true);
      expect(() => fresh.assertTokenVerificationNotBypassed("f")).not.toThrow();
    } finally {
      vi.resetModules();
    }
  });
});

describe("the operator log line", () => {
  /** A module with a COLD sampler, under a live bypass, on a frozen clock. Both tests below need
   *  all three: the `logs` limiter is module scope, so a shared instance would carry the first
   *  test's consumed slot into the second. */
  async function freshBypassModule(): Promise<typeof import("./token-verification-bypass.js")> {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("FUNCTIONS_EMULATOR", undefined);
    stubEnv("true", JSON.stringify({ skipTokenVerification: true }));
    return import("./token-verification-bypass.js");
  }

  /** The refusal is expected; these tests are about what it logs. */
  function hit(mod: typeof import("./token-verification-bypass.js"), fn: string): void {
    try {
      mod.assertTokenVerificationNotBypassed(fn);
    } catch {
      /* refusal expected — the log is what is under test */
    }
  }

  it("is sampled per interval, not once per request and not once per process", async () => {
    // A latch (one line per container, ever) cannot arm a log-based alert: in this state 100% of
    // guarded traffic is refused and no other line is emitted, so the evidence must recur for as
    // long as the condition lasts. Same reasoning the invite gate's `shouldLogRefusal` gives.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fresh = await freshBypassModule();
      for (let i = 0; i < 20; i += 1) hit(fresh, "requireAdmin");
      // Not twenty lines.
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0]?.[0]).toBe(BYPASS_LOG_MESSAGE);

      // A later window speaks again, so a long outage does not go silent after its first line.
      vi.advanceTimersByTime(10_000);
      hit(fresh, "requireAdmin");
      expect(error).toHaveBeenCalledTimes(2);
    } finally {
      error.mockRestore();
      vi.resetModules();
    }
  });

  it("names the choke point, and keys the sample per choke point", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fresh = await freshBypassModule();
      for (const fn of ["requireAdmin", "describeInvite"]) hit(fresh, fn);
      // Two DIFFERENT choke points in the same window both get a line: an invite outage must not
      // be masked by an admin-gate flood holding the only slot.
      expect(error).toHaveBeenCalledTimes(2);
      expect(error.mock.calls.map((c) => (c[1] as { fn: string }).fn)).toEqual([
        "requireAdmin",
        "describeInvite",
      ]);
    } finally {
      error.mockRestore();
      vi.resetModules();
    }
  });

  it("is the exact string the operator runbook tells someone to alert on", () => {
    // The fan-out tripwire: a log-based alert keyed on prose a refactor can reword is an alert
    // that stops firing without telling anyone. Reword the constant and this goes red until
    // docs/firebase-setup.md is updated with it.
    const doc = readFileSync(new URL("../../../docs/firebase-setup.md", import.meta.url), "utf8");
    expect(doc).toContain(BYPASS_LOG_MESSAGE);
  });
});
