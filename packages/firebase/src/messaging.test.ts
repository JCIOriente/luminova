import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/messaging", () => ({
  isSupported: vi.fn().mockResolvedValue(false),
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));

import { getMessaging } from "firebase/messaging";

describe("isPushSupported", () => {
  it("is false when the browser lacks FCM support", async () => {
    const { isPushSupported } = await import("./messaging.js");
    expect(await isPushSupported()).toBe(false);
  });
});

describe("requestPushToken", () => {
  it("returns null without touching messaging when push is unsupported", async () => {
    const { requestPushToken } = await import("./messaging.js");
    const swReg = {} as ServiceWorkerRegistration;
    expect(await requestPushToken("vapid", swReg)).toBeNull();
    expect(getMessaging).not.toHaveBeenCalled();
  });
});

describe("onForegroundMessage", () => {
  it("returns a no-op unsubscribe without touching messaging when unsupported", async () => {
    const { onForegroundMessage } = await import("./messaging.js");
    const unsub = await onForegroundMessage(() => {});
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
    expect(getMessaging).not.toHaveBeenCalled();
  });
});
