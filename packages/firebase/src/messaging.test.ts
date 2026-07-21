import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/messaging", () => ({
  isSupported: vi.fn().mockResolvedValue(false),
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));

describe("isPushSupported", () => {
  it("is false when the browser lacks FCM support", async () => {
    const { isPushSupported } = await import("./messaging.js");
    expect(await isPushSupported()).toBe(false);
  });
});
