import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.js";

/** A minute in ms, matching the windows the callables actually use. */
const MINUTE = 60_000;

function limiter(overrides: Partial<Parameters<typeof createRateLimiter>[0]> = {}) {
  return createRateLimiter({ capacity: 5, windowMs: MINUTE, maxKeys: 4, ...overrides });
}

describe("createRateLimiter", () => {
  it("allows exactly `capacity` calls in a cold window, then refuses", () => {
    const rl = limiter();
    for (let i = 0; i < 5; i += 1) {
      expect(rl.tryConsume("a", 0)).toBe(true);
    }
    expect(rl.tryConsume("a", 0)).toBe(false);
  });

  it("refills continuously, so a refusal self-heals without waiting a whole window", () => {
    const rl = limiter();
    for (let i = 0; i < 5; i += 1) rl.tryConsume("a", 0);
    expect(rl.tryConsume("a", 0)).toBe(false);

    // capacity 5 over 60s == one token every 12s. This is the property the retry copy leans
    // on: a rate-limited invitee is not locked out for a minute, only for seconds.
    expect(rl.tryConsume("a", 11_999)).toBe(false);
    expect(rl.tryConsume("a", 12_000)).toBe(true);
  });

  it("never accrues more than `capacity`, however long the key idles", () => {
    const rl = limiter();
    rl.tryConsume("a", 0);
    // A week later: the bucket is full, not overflowing into a 10-token burst.
    for (let i = 0; i < 5; i += 1) {
      expect(rl.tryConsume("a", 7 * 24 * 60 * MINUTE)).toBe(true);
    }
    expect(rl.tryConsume("a", 7 * 24 * 60 * MINUTE)).toBe(false);
  });

  it("budgets each key independently", () => {
    const rl = limiter();
    for (let i = 0; i < 5; i += 1) rl.tryConsume("a", 0);
    expect(rl.tryConsume("a", 0)).toBe(false);
    // Exhausting one token's budget must never refuse a DIFFERENT invitee. This is the whole
    // reason the per-token bucket is the tight one and the global bucket is the generous one.
    expect(rl.tryConsume("b", 0)).toBe(true);
  });

  it("never holds more than `maxKeys` buckets", () => {
    const rl = limiter({ maxKeys: 4 });
    for (let i = 0; i < 1000; i += 1) {
      rl.tryConsume(`token-${i}`, i);
    }
    // The memory bound under the exact flood the limiter exists to survive: a 256MiB instance
    // must not grow a bucket per distinct token.
    expect(rl.size()).toBe(4);
  });

  it("evicts the least recently used key, not the newest", () => {
    const rl = limiter({ maxKeys: 2 });
    rl.tryConsume("old", 0);
    rl.tryConsume("new", 0);
    // Touch `old` so `new` becomes the least recently used.
    rl.tryConsume("old", 1);
    rl.tryConsume("third", 2);

    expect(rl.has("old")).toBe(true);
    expect(rl.has("third")).toBe(true);
    expect(rl.has("new")).toBe(false);
  });

  it("gives an evicted key a fresh budget — the LRU is a memory bound, NOT a security boundary", () => {
    const rl = limiter({ maxKeys: 1 });
    for (let i = 0; i < 5; i += 1) rl.tryConsume("a", 0);
    expect(rl.tryConsume("a", 0)).toBe(false);

    // Evict "a" by touching another key, then come back to it.
    rl.tryConsume("b", 0);
    expect(rl.tryConsume("a", 0)).toBe(true);

    // This is why the GLOBAL bucket is what actually bounds a flood: a caller cycling through
    // more than `maxKeys` distinct tokens thrashes the LRU and keeps getting fresh per-token
    // budgets. Asserted rather than merely commented, so nobody later reads the per-token
    // bucket as the flood control and removes the global one.
  });

  it("does not mint tokens when the clock jumps backwards", () => {
    const rl = limiter();
    for (let i = 0; i < 5; i += 1) rl.tryConsume("a", 100_000);
    expect(rl.tryConsume("a", 100_000)).toBe(false);
    // A negative elapsed must clamp to zero rather than subtract from the balance or, worse,
    // refill it. Cloud Run instances do observe clock adjustments.
    expect(rl.tryConsume("a", 0)).toBe(false);
  });

  it("acts as a single shared bucket when maxKeys is 1 and the key is constant", () => {
    // How the GLOBAL limiter is built: one implementation, one test suite, no second code path.
    const rl = createRateLimiter({ capacity: 3, windowMs: MINUTE, maxKeys: 1 });
    expect(rl.tryConsume("*", 0)).toBe(true);
    expect(rl.tryConsume("*", 0)).toBe(true);
    expect(rl.tryConsume("*", 0)).toBe(true);
    expect(rl.tryConsume("*", 0)).toBe(false);
  });

  it("rejects a configuration that could never refuse anything", () => {
    // A capacity of 0 would refuse every call (locking out onboarding) and a negative window
    // would divide by a negative rate. Both are deploy-time typos, and both are silent.
    expect(() => createRateLimiter({ capacity: 0, windowMs: MINUTE, maxKeys: 1 })).toThrow();
    expect(() => createRateLimiter({ capacity: 5, windowMs: 0, maxKeys: 1 })).toThrow();
    expect(() => createRateLimiter({ capacity: 5, windowMs: MINUTE, maxKeys: 0 })).toThrow();
  });

  it("rejects a window that does not divide evenly by capacity", () => {
    // MEASURED, not theoretical: at capacity 7 or 13 over 60 s the emission interval is not
    // exactly representable as a float, and the cold burst comes out one SHORT of capacity
    // (6 instead of 7) while a probe one ms early is wrongly allowed. Refusing the config is
    // what keeps every other assertion in this file exact, and it turns a latent, silent,
    // capacity-dependent off-by-one into a startup error the moment someone retunes the
    // ceiling.
    expect(() => createRateLimiter({ capacity: 7, windowMs: MINUTE, maxKeys: 4 })).toThrow(
      /divide/i,
    );
    expect(() => createRateLimiter({ capacity: 13, windowMs: MINUTE, maxKeys: 4 })).toThrow();
    // The configs the callables actually use, and the neighbours someone would plausibly
    // retune to, all divide exactly.
    for (const capacity of [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60]) {
      expect(() => createRateLimiter({ capacity, windowMs: MINUTE, maxKeys: 4 })).not.toThrow();
    }
  });

  it("grants exactly `capacity` from cold for every accepted configuration", () => {
    // The property the divisibility check exists to protect. Asserted across the accepted
    // range rather than only at 5, because the bug it prevents is capacity-dependent.
    for (const capacity of [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60]) {
      const rl = createRateLimiter({ capacity, windowMs: MINUTE, maxKeys: 2 });
      let burst = 0;
      while (rl.tryConsume("a", 0)) burst += 1;
      expect(burst, `capacity ${capacity}`).toBe(capacity);
      // And the next token lands exactly one emission interval later, never a ms early.
      const interval = MINUTE / capacity;
      expect(rl.tryConsume("a", interval - 1), `capacity ${capacity} early`).toBe(false);
      expect(rl.tryConsume("a", interval), `capacity ${capacity} due`).toBe(true);
    }
  });
});
