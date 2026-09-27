import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { INVITE_RATE_LIMITS } from "@luminova/types/member-invite";
import { BYPASS_LOG_MESSAGE } from "./token-verification-bypass.js";
import { UNAUTHENTICATED_CALLABLES } from "./redeem-invite.js";
import { callableOptions, guardedOnCall, type GuardedCallableOptions } from "./guarded-on-call.js";
import { callableExports } from "./test-support/callable-exports.js";

// SANDBOX, before `index.ts` loads: it calls `initializeApp()` at module scope, and a mutated
// handler that gets past the guard would otherwise reach whatever the machine's environment
// names. The dead emulator hosts are what keep Firestore and Auth off live data: the admin SDK
// sends their calls to a closed port, a fast connection failure the per-call timeout below
// catches. The project id is pinned at every source firebase-admin consults for an
// option-less `initializeApp()` with application-default credentials, in its order:
// `FIREBASE_CONFIG`'s `projectId`, then `GOOGLE_CLOUD_PROJECT`, then `GCLOUD_PROJECT`.
// `FUNCTIONS_EMULATOR` stays unset — it is what switches the guard off.
const DEMO_PROJECT = "demo-guarded-on-call";
const SANDBOX: Record<string, string> = {
  FIREBASE_CONFIG: JSON.stringify({ projectId: DEMO_PROJECT }),
  GOOGLE_CLOUD_PROJECT: DEMO_PROJECT,
  GCLOUD_PROJECT: DEMO_PROJECT,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:1",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:1",
};
const saved = Object.fromEntries(Object.keys(SANDBOX).map((k) => [k, process.env[k]]));
Object.assign(process.env, SANDBOX);
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

interface Callable {
  run(request: CallableRequest<unknown>): unknown;
}

function isCallable(v: unknown): v is Callable {
  return typeof v === "function" && "run" in v && typeof v.run === "function";
}

// The SAME selection as the deploy-list test in `redeem-invite.test.ts` (`callableExports`):
// whatever `index.ts` exports with a `callableTrigger` is a deployed callable, however it was
// declared.
const entry: Record<string, unknown> = await import("./index.js");
const CALLABLES = new Map<string, Callable>();
for (const [name, v] of callableExports(entry)) {
  if (!isCallable(v)) throw new Error(`callable export ${name} has no .run`);
  CALLABLES.set(name, v);
}
const NAMES = [...CALLABLES.keys()].sort();
const UNAUTHENTICATED: readonly string[] = UNAUTHENTICATED_CALLABLES;

// The cast stands in for the fields no handler reads: `rawRequest` and the streaming plumbing.
function request(auth?: { uid: string; token: Record<string, unknown> }): CallableRequest<unknown> {
  return { data: {}, auth, rawRequest: { headers: {} } } as unknown as CallableRequest<unknown>;
}
/** The claims a forged token carries: enough to pass every gate beacon has. */
const FORGED_ADMIN = {
  uid: "forged",
  token: { roles: ["Admin"], perms: ["create:MemberLogin"] },
};

type Outcome =
  | { code: string; reason: string | null }
  | { notAnHttpsError: string }
  | "resolved"
  | "timeout";

/** Settles a `.run` within a short budget, so a mutated handler that reaches for Firestore
 *  fails fast instead of hanging the suite. */
async function settle(call: () => unknown): Promise<Outcome> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => resolve("timeout"), 2_000);
  });
  const run = Promise.resolve()
    .then(call)
    .then(
      (): Outcome => "resolved",
      (err: unknown): Outcome => {
        if (!(err instanceof HttpsError)) return { notAnHttpsError: String(err) };
        const { details } = err;
        const reason =
          typeof details === "object" &&
          details !== null &&
          "reason" in details &&
          typeof details.reason === "string"
            ? details.reason
            : null;
        return { code: err.code, reason };
      },
    );
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function refusalFor(name: string): Outcome {
  return UNAUTHENTICATED.includes(name)
    ? { code: "failed-precondition", reason: "invite-service-misconfigured" }
    : { code: "internal", reason: null };
}

function callable(name: string): Callable {
  const c = CALLABLES.get(name);
  if (c === undefined) throw new Error(`no callable export named ${name}`);
  return c;
}

function stubBypass(): void {
  vi.stubEnv("FIREBASE_DEBUG_MODE", "true");
  vi.stubEnv("FIREBASE_DEBUG_FEATURES", JSON.stringify({ skipTokenVerification: true }));
}

// ONE monotonic fake clock for the whole file, faking only `Date`: the refusal log is sampled
// once per `fn` per interval and the invite buckets refill by elapsed time, so a clock that ran
// backwards between tests would hand one test's windows to the next. Faking timers too would
// stall `settle`'s timeout.
let clock = Date.now();
function advance(ms: number): void {
  clock += ms;
  vi.setSystemTime(clock);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Past every earlier test's windows.
  advance(3_600_000);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("finds every deployed callable, the unauthenticated pair among them", () => {
  // An empty selection would make every `it.each` below vacuous.
  expect(process.env.FUNCTIONS_EMULATOR).toBeUndefined();
  expect(NAMES.length).toBeGreaterThanOrEqual(7);
  expect(NAMES).toEqual(expect.arrayContaining([...UNAUTHENTICATED_CALLABLES]));
});

describe("every exported callable refuses while token verification is bypassed", () => {
  // THE EXPLOIT. With FIREBASE_DEBUG_MODE=true and FIREBASE_DEBUG_FEATURES carrying
  // skipTokenVerification, firebase-functions decodes the Auth ID token without verifying it, so
  // `roles: ["Admin"]` is free to anyone who can reach the URL. No gate can tell a forged claim
  // from a real one, so the only defence is refusing ALL traffic — before any claim is read.
  //
  // Driven through `.run`, which firebase-functions wires straight to the registered handler: a
  // callable declared with a raw `onCall` (an eslint-disable, a dynamic import) reaches its own
  // body here and fails, whatever lint said.
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stubBypass();
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each(NAMES)("%s refuses with its exact refusal and logs its own name", async (name) => {
    for (const [label, auth] of [
      // Identical to a real Admin's claims — the environment is the only thing left to key on.
      ["a forged Admin", FORGED_ADMIN],
      // `internal`/tagged, not `unauthenticated`: the refusal precedes every claim read, and
      // reporting it as a missing session would send an operator hunting the caller.
      ["no session", undefined],
    ] as const) {
      // A fresh log window per call, so each one's line is observable.
      advance(INVITE_RATE_LIMITS.refusalLogIntervalMs);
      error.mockClear();
      expect(await settle(() => callable(name).run(request(auth))), `${name}: ${label}`).toEqual(
        refusalFor(name),
      );
      // The CALLABLE's name, not a gate's: the sampler is keyed on it too, so a shared key would
      // let one endpoint's flood hide another's.
      expect(error, `${name}: ${label}`).toHaveBeenCalledWith(BYPASS_LOG_MESSAGE, { fn: name });
    }
  });

  it("refuses the invite pair BEFORE their rate gates are charged", async () => {
    // A refused request must not consume a real invitee's budget. Exhaust-by-refusal, then prove
    // the endpoint-wide bucket still admits: charged-before-refusing would fail the last call
    // with `invite-too-many-attempts`. `Date` stays frozen across the loop so the window cannot
    // refill.
    for (const name of UNAUTHENTICATED_CALLABLES) {
      for (let i = 0; i <= INVITE_RATE_LIMITS.globalPerMinute; i += 1) {
        expect(await settle(() => callable(name).run(request()))).toEqual(refusalFor(name));
      }
    }
    vi.stubEnv("FIREBASE_DEBUG_MODE", "false");
    for (const name of UNAUTHENTICATED_CALLABLES) {
      // No token: the first refusal past the global bucket, and it reads nothing.
      expect(await settle(() => callable(name).run(request())), name).toEqual({
        code: "failed-precondition",
        reason: "invite-invalid",
      });
    }
  });
});

describe("every exported callable passes through the guard when the bypass is INERT", () => {
  // Both keys present, the mode off: a wrapper keyed on the keys' presence would refuse here,
  // so this pins that the wrapper consults the real predicate. The predicate's own inert cases
  // are pinned against the installed library in `token-verification-bypass.test.ts`. Each
  // callable's first refusal past the guard is cheap and reads nothing: no session for the gated
  // five, no token for the invite pair.
  function passedThrough(name: string): Outcome {
    return UNAUTHENTICATED.includes(name)
      ? { code: "failed-precondition", reason: "invite-invalid" }
      : { code: "unauthenticated", reason: null };
  }

  it.each(NAMES)("%s serves when the mode is off but the features key is set", async (name) => {
    vi.stubEnv("FIREBASE_DEBUG_MODE", "false");
    vi.stubEnv("FIREBASE_DEBUG_FEATURES", JSON.stringify({ skipTokenVerification: true }));
    expect(await settle(() => callable(name).run(request()))).toEqual(passedThrough(name));
  });
});

describe("guardedOnCall itself", () => {
  it("delegates the request and returns the handler's value when the bypass is inert", async () => {
    const probe = guardedOnCall({ name: "probe" }, async (r) => ({ echoed: r.data }));
    await expect(probe.run({ ...request(), data: 42 })).resolves.toEqual({ echoed: 42 });
  });

  it("defaults to an UNTAGGED internal, and never enters the handler", async () => {
    stubBypass();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(async () => "reached");
    const probe = guardedOnCall({ name: "probe" }, handler);
    expect(await settle(() => probe.run(request(FORGED_ADMIN)))).toEqual({
      code: "internal",
      reason: null,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(BYPASS_LOG_MESSAGE, { fn: "probe" });
  });

  it("rejects a literal authPolicy at the type level: firebase-functions runs it first", () => {
    // Pinned by `pnpm --filter beacon typecheck` (tsconfig.test.json): drop the `Omit` and the
    // directive below is unused, which fails the build. A spread escapes the type; the runtime
    // wrap is pinned below.
    const options: GuardedCallableOptions<unknown> = {
      name: "probe",
      // @ts-expect-error — an authPolicy would read forged claims before the guard runs.
      authPolicy: () => true,
    };
    expect(options.name).toBe("probe");
  });

  describe("an authPolicy spread past the type", () => {
    // firebase-functions awaits `options.authPolicy` in its HTTP wrapper before the handler, so
    // `.run` never reaches it: the options `guardedOnCall` hands `onCall` are tested directly.
    // Typed `object`, the spread adds no known property, so the excess-property check is silent.
    function optionsWithPolicy(policy: () => boolean) {
      const wider: object = { authPolicy: policy };
      const { authPolicy } = callableOptions({ name: "probe", ...wider });
      if (authPolicy === undefined) throw new Error("authPolicy was dropped");
      return authPolicy;
    }

    it("refuses under the bypass without calling the policy", async () => {
      stubBypass();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const policy = vi.fn(() => true);
      expect(await settle(() => optionsWithPolicy(policy)(null, {}))).toEqual({
        code: "internal",
        reason: null,
      });
      expect(policy).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(BYPASS_LOG_MESSAGE, { fn: "probe" });
    });

    it("delegates to the policy when the bypass is inert", async () => {
      const policy = vi.fn(() => false);
      expect(await optionsWithPolicy(policy)(null, { x: 1 })).toBe(false);
      expect(policy).toHaveBeenCalledWith(null, { x: 1 });
    });
  });

  it("strips name and refusal from what onCall sees", () => {
    const options = callableOptions({
      name: "probe",
      refusal: () => new HttpsError("internal", "x"),
      maxInstances: 3,
    });
    expect(options).toEqual({ maxInstances: 3 });
  });

  it("hands onCall its options, so __endpoint keeps its shape", () => {
    // firebase-functions copies only the fields it knows into `__endpoint`, so the stripping is
    // pinned on `callableOptions` above; this pins the pass-through alone.
    const probe = guardedOnCall(
      { name: "probe", maxInstances: 3, timeoutSeconds: 12 },
      async () => null,
    );
    expect(probe.__endpoint).toMatchObject({
      maxInstances: 3,
      timeoutSeconds: 12,
      callableTrigger: {},
    });
  });
});
