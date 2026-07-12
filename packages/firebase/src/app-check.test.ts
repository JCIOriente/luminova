import type { FirebaseApp } from "firebase/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializeAppCheck = vi.fn();
const ReCaptchaV3Provider = vi.fn();

vi.mock("firebase/app-check", () => ({ initializeAppCheck, ReCaptchaV3Provider }));

// initAppCheck only forwards the app to the (mocked) initializeAppCheck, so a name-only stub suffices.
const app = { name: "app" } as unknown as FirebaseApp;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("initAppCheck", () => {
  it("does nothing when no site key is set", async () => {
    const { initAppCheck } = await import("./app-check");
    initAppCheck(app);
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("initializes reCAPTCHA v3 App Check when a site key is set", async () => {
    vi.stubEnv("VITE_APPCHECK_SITE_KEY", "site-key");
    const { initAppCheck } = await import("./app-check");
    initAppCheck(app);
    expect(ReCaptchaV3Provider).toHaveBeenCalledWith("site-key");
    expect(initializeAppCheck).toHaveBeenCalledWith(
      app,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
  });
});
