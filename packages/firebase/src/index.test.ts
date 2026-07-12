import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializeApp = vi.fn(() => ({ name: "app" }));
const getApps = vi.fn(() => []);
const getApp = vi.fn(() => ({ name: "app" }));
const getAuth = vi.fn(() => ({}));
const connectAuthEmulator = vi.fn();
const getFirestore = vi.fn(() => ({}));
const connectFirestoreEmulator = vi.fn();
const getStorage = vi.fn(() => ({}));
const connectStorageEmulator = vi.fn();
const getFunctions = vi.fn(() => ({}));
const connectFunctionsEmulator = vi.fn();
const initializeAppCheck = vi.fn();
const ReCaptchaV3Provider = vi.fn();

vi.mock("firebase/app", () => ({ initializeApp, getApps, getApp }));
vi.mock("firebase/auth", () => ({ getAuth, connectAuthEmulator }));
vi.mock("firebase/firestore", () => ({ getFirestore, connectFirestoreEmulator }));
vi.mock("firebase/storage", () => ({ getStorage, connectStorageEmulator }));
vi.mock("firebase/functions", () => ({ getFunctions, connectFunctionsEmulator }));
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

describe("getFirebase", () => {
  it("initializes the app once and memoizes services", async () => {
    const { getFirebase } = await import("./index");
    const first = getFirebase();
    const second = getFirebase();
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("does not connect emulators when the flag is off", async () => {
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
  });

  it("connects emulators when the flag is on", async () => {
    vi.stubEnv("VITE_FIREBASE_EMULATOR_ENABLED", "true");
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(connectFirestoreEmulator).toHaveBeenCalledWith({}, "127.0.0.1", 4010);
    expect(connectAuthEmulator).toHaveBeenCalled();
    expect(connectStorageEmulator).toHaveBeenCalledWith({}, "127.0.0.1", 9199);
    expect(connectFunctionsEmulator).toHaveBeenCalledWith({}, "127.0.0.1", 4020);
  });

  it("wires App Check on the full SDK path when a site key is set", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    const { getFirebase } = await import("./index");
    getFirebase();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });
});
