/** An in-process rate limiter for the two UNAUTHENTICATED callables.
 *
 *  WHY NOTHING IS PERSISTED. `describeInvite` costs two keyed reads and zero writes. A
 *  Firestore-backed counter would cost a read AND a write per call — the limiter would then be
 *  more expensive than the endpoint it protects, and it would hand an unauthenticated caller a
 *  guaranteed billable write per request. A limiter that is itself the cheapest way to run up
 *  the bill is not a control. So a refusal performs NO FIRESTORE READ AND NO FIRESTORE WRITE:
 *  a map lookup and some integer arithmetic.
 *
 *  Not "no I/O, ever", which an earlier draft of this comment claimed and which was false: the
 *  caller emits a Cloud Logging line, and log ingestion is a billed write to a Google service
 *  on an attacker-reachable path. It stays inside the free tier even at full flood, so the
 *  consequence is signal rather than cost — 60 refusals/min/instance would bury the stream the
 *  monitoring alert has to read — which is why the caller SAMPLES those lines through
 *  `shouldLogRefusal` instead of writing one per refusal.
 *
 *  WHAT THIS DOES NOT PREVENT, stated here rather than only in a test. The endpoint-wide
 *  bucket is shared fate: a caller who can sustain its rate denies every legitimate invitee,
 *  whose own per-token budgets sit untouched, and malformed junk counts toward it too. The
 *  limiter LOWERS the cost of causing that — before it, a flood had to saturate ten instances
 *  doing Firestore reads; now in-memory refusals suffice. That is an accepted trade, not an
 *  oversight: the alternative is either a tight per-token-only limiter that does not bound a
 *  distinct-token flood at all, or a per-source key, which needs a trustworthy client address
 *  that Cloud Run does not give us (see `redeem-invite.ts`). What makes it acceptable is that
 *  the outage is observable — hence the throttle-rate alert in docs/firebase-setup.md — and
 *  that the refusal is cheap enough not to also cost money.
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
  /** Buckets currently held. Exists for the memory-bound test; nothing in production reads
   *  it. */
  size(): number;
  /** Whether a bucket is currently held. Test introspection only, like `size()` — it is how
   *  the LRU-eviction assertions see which key was dropped. */
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
  //
  // Throwing here runs at module scope in a module `index.ts` pulls into the single deployed
  // entry, so a bad config would take out every trigger in the bundle at cold start. That is
  // bounded rather than a live hazard: the shipped constants are literals, a unit test builds
  // the real gate in CI, and firebase-tools loads this module during deploy-time discovery —
  // so a bad retune fails the build and then the deploy, never a running instance.
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
      // A non-finite clock must REFUSE and CHANGE NOTHING. Persisting NaN would make every
      // later `Math.max(stored, nowMs)` NaN too, so the key would be refused forever — and on
      // the global bucket (`maxKeys: 1`) that is a permanent, silent, instance-wide denial of
      // the only onboarding path, fixable only by a redeploy. Unreachable from the shipped
      // adapter (`Date.now()`), but `now` is an injected port and this module claims to be
      // clock-anomaly-safe, so the claim has to hold for the whole domain of the parameter.
      if (!Number.isFinite(nowMs)) return false;

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
