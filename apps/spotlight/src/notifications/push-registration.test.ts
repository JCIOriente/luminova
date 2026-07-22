import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestPushToken = vi.fn();
const setDoc = vi.fn();
const doc = vi.fn((_db, ...path: string[]) => ({ path: path.join("/") }));
const serverTimestamp = vi.fn(() => "SERVER_TS");
const getFirestoreLite = vi.fn(() => ({ __db: true }));

vi.mock("@luminova/firebase/messaging", () => ({ requestPushToken }));
vi.mock("@luminova/firebase/lite", () => ({ getFirestoreLite }));
vi.mock("firebase/firestore/lite", () => ({ setDoc, doc, serverTimestamp }));

const register = vi.fn().mockResolvedValue({ scope: "/" });

beforeEach(() => {
  vi.clearAllMocks();
  register.mockResolvedValue({ scope: "/" });
  vi.stubGlobal("navigator", { serviceWorker: { register } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enablePush", () => {
  it("registers the SW and writes pushTokens/{token} when a token resolves", async () => {
    requestPushToken.mockResolvedValue("tok-123");
    const { enablePush } = await import("./push-registration");

    const result = await enablePush();

    expect(result).toBe("tok-123");
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(expect.stringMatching(/^\/firebase-messaging-sw\.js\?/));
    expect(doc).toHaveBeenCalledWith({ __db: true }, "pushTokens", "tok-123");
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { createdAt: "SERVER_TS" });
  });

  it("writes nothing and returns null when no token resolves", async () => {
    requestPushToken.mockResolvedValue(null);
    const { enablePush } = await import("./push-registration");

    const result = await enablePush();

    expect(result).toBeNull();
    expect(register).toHaveBeenCalledTimes(1);
    expect(setDoc).not.toHaveBeenCalled();
  });
});
