import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializeApp = vi.fn(() => ({ name: "app" }));
const getApps = vi.fn(() => []);
const getApp = vi.fn(() => ({ name: "app" }));
const getFirestore = vi.fn(() => ({}));
const connectFirestoreEmulator = vi.fn();
const initializeAppCheck = vi.fn();
const ReCaptchaV3Provider = vi.fn();

vi.mock("firebase/app", () => ({ initializeApp, getApps, getApp }));
vi.mock("firebase/firestore/lite", () => ({ getFirestore, connectFirestoreEmulator }));
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

describe("getFirestoreLite", () => {
  it("memoizes the db instance", async () => {
    const { getFirestoreLite } = await import("./firestore-lite");
    expect(getFirestoreLite()).toBe(getFirestoreLite());
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });

  it("wires App Check on the public read path when a site key is set", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    const { getFirestoreLite } = await import("./firestore-lite");
    getFirestoreLite();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });
});
