import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializeApp = vi.fn(() => ({ name: "app" }));
const getApps = vi.fn(() => []);
const getApp = vi.fn(() => ({ name: "app" }));
const getFirestore = vi.fn(() => ({ svc: "db" }));
const connectFirestoreEmulator = vi.fn();
const getStorage = vi.fn(() => ({ svc: "storage" }));
const connectStorageEmulator = vi.fn();
const getFunctions = vi.fn(() => ({ svc: "functions" }));
const connectFunctionsEmulator = vi.fn();
const initializeAppCheck = vi.fn();
const ReCaptchaV3Provider = vi.fn();

vi.mock("firebase/app", () => ({ initializeApp, getApps, getApp }));
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

describe("service subpaths acquire on demand from the shared app", () => {
  it("getDb memoizes and wires App Check via ensureApp", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    const { getDb } = await import("./db");
    expect(getDb()).toBe(getDb());
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
  });

  it("getDb connects the firestore emulator when the flag is on", async () => {
    vi.stubEnv("VITE_FIREBASE_EMULATOR_ENABLED", "true");
    const { getDb } = await import("./db");
    getDb();
    expect(connectFirestoreEmulator).toHaveBeenCalledWith({ svc: "db" }, "127.0.0.1", 4010);
  });

  it("getStorageService memoizes and connects the storage emulator when on", async () => {
    vi.stubEnv("VITE_FIREBASE_EMULATOR_ENABLED", "true");
    const { getStorageService } = await import("./storage");
    expect(getStorageService()).toBe(getStorageService());
    expect(connectStorageEmulator).toHaveBeenCalledWith({ svc: "storage" }, "127.0.0.1", 9199);
  });

  it("getFunctionsService memoizes and connects the functions emulator when on", async () => {
    vi.stubEnv("VITE_FIREBASE_EMULATOR_ENABLED", "true");
    const { getFunctionsService } = await import("./functions");
    expect(getFunctionsService()).toBe(getFunctionsService());
    expect(connectFunctionsEmulator).toHaveBeenCalledWith({ svc: "functions" }, "127.0.0.1", 4020);
  });
});
