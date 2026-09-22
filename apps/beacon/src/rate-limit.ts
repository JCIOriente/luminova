/** An in-process rate limiter for the two UNAUTHENTICATED callables.
 *
 *  WHY NOTHING IS PERSISTED. `describeInvite` costs two keyed reads and zero writes. A
 *  Firestore-backed counter would cost a read AND a write per call — the limiter would then be
 *  more expensive than the endpoint it protects, and it would hand an unauthenticated caller a
 *  guaranteed billable write per request. A limiter that is itself the cheapest way to run up
 *  the bill is not a control. So: no I/O, ever. A refusal costs a map lookup and some integer
 *  arithmetic, which is the only way a refusal can be cheaper than the work it prevents.
 *
 *  WHAT THIS DOES AND DOES NOT BOUND. State lives in ONE instance's memory. The honest ceiling
 *  is therefore "`capacity` per window PER INSTANCE, times however many instances are warm" —
 *  never a global figure. `maxInstances: 10` is what makes that product finite; see
 *  `redeem-invite.ts` for the two windows and why they are sized differently.
 *
 *  HOW IT COUNTS, AND WHY THE WINDOW MUST DIVIDE EVENLY. This is the generic cell rate
 *  algorithm: store ONE timestamp per key — the theoretical arrival time of that key's next
 *  conforming request — and push it forward by a fixed emission interval on each grant. The
 *  alternative, a float token balance refilled by `elapsed * capacity / windowMs`, needs two
 *  numbers and re-rounds on every access including refused probes.
 *
 *  Neither form is exact when `windowMs / capacity` is not exactly representable, and the
 *  failure is measured rather than theoretical: at capacity 7 or 13 over 60 s BOTH forms hand
 *  out a cold burst of one less than `capacity` and allow a probe one ms before the interval
 *  is up. So the interval is required to be an integer and a configuration that would not
 *  produce one is refused at construction. That makes every comparison here integer
 *  arithmetic, exact at the boundary, and it converts a silent capacity-dependent off-by-one
 *  into a startup error the moment someone retunes the ceiling. */

export interface RateLimiterOptions {
  /** Calls allowed per `windowMs` — and, equivalently, the burst allowed from cold. */
  capacity: number;
  windowMs: number;
  /** Hard bound on distinct keys held in memory. See `tryConsume` — this is a MEMORY bound,
   *  not a security boundary. */
  maxKeys: number;
}

export interface RateLimiter {
  /** Consume one unit for `key`. `true` = allowed. */
  tryConsume(key: string, nowMs: number): boolean;
  /** Buckets currently held. For the memory-bound test, and for a log line. */
  size(): number;
  has(key: string): boolean;
}

export function createRateLimiter({
  capacity,
  windowMs,
  maxKeys,
}: RateLimiterOptions): RateLimiter {
  // Fail LOUDLY at module evaluation rather than silently at runtime. `capacity: 0` would
  // refuse every call — which, on the only onboarding path there is, means nobody can ever set
  // a password again, with no error an operator would recognize as a config typo.
  if (!Number.isInteger(capacity) || capacity < 1)
    throw new Error(`rate limiter capacity must be a positive integer, got ${capacity}`);
  if (!Number.isFinite(windowMs) || windowMs <= 0)
    throw new Error(`rate limiter windowMs must be positive, got ${windowMs}`);
  if (!Number.isInteger(maxKeys) || maxKeys < 1)
    throw new Error(`rate limiter maxKeys must be a positive integer, got ${maxKeys}`);
  // See the header: a non-integral emission interval silently costs one slot of the cold
  // burst and mis-answers the boundary by a millisecond.
  if (!Number.isInteger(windowMs / capacity))
    throw new Error(
      `rate limiter windowMs (${windowMs}) must divide evenly by capacity (${capacity}); ` +
        `${windowMs / capacity} is not an exact emission interval`,
    );

  /** The spacing between conforming requests once the burst is spent: one token every
   *  `windowMs / capacity` ms. 5 per 60 s is one every 12 s, which is what makes a rate-limit
   *  refusal self-heal in seconds rather than stranding someone for a whole minute. */
  const emissionIntervalMs = windowMs / capacity;
  /** How far the theoretical arrival time may run ahead of now before a request is refused. */
  const burstToleranceMs = (capacity - 1) * emissionIntervalMs;

  /** key -> theoretical arrival time of that key's next conforming request.
   *
   *  Insertion-ordered, and every access re-inserts, so the FIRST key is always the least
   *  recently used. That is the whole eviction mechanism — no timestamps to sweep, no timer. */
  const arrivals = new Map<string, number>();

  return {
    tryConsume(key, nowMs) {
      const stored = arrivals.get(key);
      // max(stored, now) is also what makes a BACKWARDS clock jump safe: an instance whose
      // clock is corrected downwards must not mint tokens, and Cloud Run instances do observe
      // adjustments. A stale arrival time in the future simply keeps refusing until real time
      // catches up.
      const arrival = stored === undefined ? nowMs : Math.max(stored, nowMs);
      const allowed = arrival - nowMs <= burstToleranceMs;

      if (stored !== undefined) {
        // Re-insert to mark this key most-recently-used, on a REFUSAL too: a key being
        // hammered is the one we most want to keep a bucket for, since evicting it is what
        // hands it a fresh budget.
        arrivals.delete(key);
      }
      // Advance ONLY on success. A refused request must not push the arrival time further out,
      // or a caller who keeps hammering would extend their own penalty without bound — a
      // limiter, not a jail.
      arrivals.set(key, allowed ? arrival + emissionIntervalMs : arrival);

      while (arrivals.size > maxKeys) {
        const lru = arrivals.keys().next();
        if (lru.done === true) break;
        arrivals.delete(lru.value);
      }
      return allowed;
    },
    size: () => arrivals.size,
    has: (key) => arrivals.has(key),
  };
}
