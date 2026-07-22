import { describe, it, expect, vi, beforeEach } from "vitest";

const { requestPushToken, onForegroundMessage, getDb, doc, setDoc, deleteDoc } = vi.hoisted(() => ({
  requestPushToken:
    vi.fn<(vapid: string, reg: ServiceWorkerRegistration) => Promise<string | null>>(),
  onForegroundMessage: vi.fn<(handler: (p: unknown) => void) => Promise<() => void>>(
    async () => () => {},
  ),
  getDb: vi.fn<() => unknown>(() => ({})),
  doc: vi.fn<(db: unknown, path: string) => { path: string }>((_db, path) => ({ path })),
  setDoc: vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => undefined),
  deleteDoc: vi.fn<(ref: unknown) => Promise<void>>(async () => undefined),
}));

vi.mock("@luminova/firebase/messaging", () => ({ requestPushToken, onForegroundMessage }));
vi.mock("@luminova/firebase/db", () => ({ getDb }));
vi.mock("firebase/firestore", () => ({
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp: () => "SERVER_TIME",
}));

const swRegister = vi.fn(async () => ({ scope: "/" }) as unknown as ServiceWorkerRegistration);

import { enablePush, disablePush } from "./push-registration";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: swRegister },
  });
});

describe("enablePush", () => {
  it("registers the FCM SW and persists the token under members/{uid}/fcmTokens/{token}", async () => {
    requestPushToken.mockResolvedValue("tok-123");

    const result = await enablePush("uid-9");

    expect(result).toBe("tok-123");
    expect(swRegister).toHaveBeenCalledWith(expect.stringContaining("/firebase-messaging-sw.js?"));
    expect(doc).toHaveBeenCalledWith(expect.anything(), "members/uid-9/fcmTokens/tok-123");
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "members/uid-9/fcmTokens/tok-123" }),
      { createdAt: "SERVER_TIME" },
    );
  });

  it("writes nothing and returns null when no token is granted", async () => {
    requestPushToken.mockResolvedValue(null);

    const result = await enablePush("uid-9");

    expect(result).toBeNull();
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe("disablePush", () => {
  it("deletes the token doc for the uid", async () => {
    await disablePush("uid-9", "tok-123");

    expect(doc).toHaveBeenCalledWith(expect.anything(), "members/uid-9/fcmTokens/tok-123");
    expect(deleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "members/uid-9/fcmTokens/tok-123" }),
    );
  });
});
