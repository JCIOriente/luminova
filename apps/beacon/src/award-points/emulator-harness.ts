import { initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Test-only harness shared by the *.emulator.test.ts suites (app bootstrap +
// Firestore proxies). Not part of the runtime bundle (nothing under
// dist/index.js imports this).

/** Fail closed: the admin SDK silently targets PROD if the emulator host is
 *  unset, so refuse to run outside `pnpm test:emulator`. Each vitest file runs
 *  in its own worker, so a per-file default app never collides. */
export function initEmulatorTestApp(): { app: App; db: Firestore } {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "emulator tests must run via `pnpm test:emulator` — FIRESTORE_EMULATOR_HOST is unset.",
    );
  }
  const app = initializeApp({ projectId: "demo-beacon-test" });
  return { app, db: getFirestore(app) };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function clearCollections(db: Firestore, names: string[]): Promise<void> {
  await Promise.all(
    names.map(async (name) => {
      const snap = await db.collection(name).get();
      await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
    }),
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Delays every read (the participations query AND any transaction read) so a
 * recompute/sync reads an early snapshot but commits late — the ordering that
 * turns a lost-update window into a permanent corruption if the write path is
 * not transactionally anchored.
 */
export function slowReadsDb(real: Firestore, delayMs: number): Firestore {
  const wrapQuery = (q: any): any =>
    new Proxy(q, {
      get(t, p) {
        if (p === "where") return (...a: unknown[]) => wrapQuery(t.where(...a));
        if (p === "get")
          return async () => {
            const r = await t.get();
            await sleep(delayMs);
            return r;
          };
        const v = Reflect.get(t, p, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  const wrapTx = (tx: any): any =>
    new Proxy(tx, {
      get(t, p) {
        if (p === "get")
          return async (ref: unknown) => {
            const r = await t.get(ref);
            await sleep(delayMs);
            return r;
          };
        const v = Reflect.get(t, p, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  return new Proxy(real, {
    get(t, p) {
      if (p === "collection")
        return (name: string) =>
          name === "participations" ? wrapQuery(t.collection(name)) : t.collection(name);
      if (p === "runTransaction")
        return (fn: (tx: unknown) => unknown, opts?: unknown) =>
          (t as any).runTransaction((tx: unknown) => fn(wrapTx(tx)), opts);
      const v = Reflect.get(t, p, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
  }) as Firestore;
}

/**
 * Counts how many times a transaction ISSUES a write (set/update) to one doc
 * path — asserts write-skip/always-write behavior at the source, independent of
 * Firestore's no-op-identical-write optimization (the emulator does not bump
 * updateTime on an identical merge, so updateTime can't tell).
 */
export function countTxWritesTo(
  real: Firestore,
  path: string,
): { db: Firestore; writes: () => number } {
  let count = 0;
  const wrapTx = (tx: any): any =>
    new Proxy(tx, {
      get(t, p) {
        if (p === "set" || p === "update")
          return (ref: { path?: string }, ...rest: unknown[]) => {
            if (ref?.path === path) count += 1;
            return t[p](ref, ...rest);
          };
        const v = Reflect.get(t, p, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  const proxied = new Proxy(real, {
    get(t, p) {
      if (p === "runTransaction")
        return (fn: (tx: unknown) => unknown, opts?: unknown) =>
          (t as any).runTransaction((tx: unknown) => fn(wrapTx(tx)), opts);
      const v = Reflect.get(t, p, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
  }) as Firestore;
  return { db: proxied, writes: () => count };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
