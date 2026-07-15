import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializeApp = vi.fn(() => ({ name: "app" }));
const getApps = vi.fn(() => []);
const getApp = vi.fn(() => ({ name: "app" }));
const getAuth = vi.fn(() => ({}));
const connectAuthEmulator = vi.fn();
const initializeAppCheck = vi.fn();
const ReCaptchaV3Provider = vi.fn();

vi.mock("firebase/app", () => ({ initializeApp, getApps, getApp }));
vi.mock("firebase/auth", () => ({ getAuth, connectAuthEmulator }));
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

describe("getFirebase (auth shell)", () => {
  it("initializes the app once and memoizes the shell", async () => {
    const { getFirebase } = await import("./index");
    const first = getFirebase();
    const second = getFirebase();
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("exposes only app + auth (firestore/storage/functions live behind subpaths)", async () => {
    const { getFirebase } = await import("./index");
    expect(Object.keys(getFirebase()).sort()).toEqual(["app", "auth"]);
  });

  it("does not connect the auth emulator when the flag is off", async () => {
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(connectAuthEmulator).not.toHaveBeenCalled();
  });

  it("connects the auth emulator when the flag is on", async () => {
    vi.stubEnv("VITE_FIREBASE_EMULATOR_ENABLED", "true");
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(connectAuthEmulator).toHaveBeenCalled();
  });

  it("wires App Check on the shell when a site key is set", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });
});
