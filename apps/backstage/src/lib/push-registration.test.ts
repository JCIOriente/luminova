import { describe, it, expect, vi, beforeEach } from "vitest";

const { requestPushToken, revokePushToken, onForegroundMessage, fcmAdd, fcmRemove } = vi.hoisted(
  () => ({
    requestPushToken:
      vi.fn<(vapid: string, reg: ServiceWorkerRegistration) => Promise<string | null>>(),
    revokePushToken: vi.fn<() => Promise<void>>(async () => undefined),
    onForegroundMessage: vi.fn<(handler: (p: unknown) => void) => Promise<() => void>>(
      async () => () => {},
    ),
    fcmAdd: vi.fn<(token: string) => Promise<void>>(async () => undefined),
    fcmRemove: vi.fn<(token: string) => Promise<void>>(async () => undefined),
  }),
);

vi.mock("@luminova/firebase/messaging", () => ({
  requestPushToken,
  revokePushToken,
  onForegroundMessage,
}));

const fcmTokenRepositoryCtor = vi.fn<(uid: string) => void>();
vi.mock("../features/notifications/repositories/fcm-token-repository", () => ({
  FcmTokenRepository: class {
    constructor(uid: string) {
      fcmTokenRepositoryCtor(uid);
    }
    add(token: string) {
      return fcmAdd(token);
    }
    remove(token: string) {
      return fcmRemove(token);
    }
  },
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
    expect(fcmTokenRepositoryCtor).toHaveBeenCalledWith("uid-9");
    expect(fcmAdd).toHaveBeenCalledWith("tok-123");
  });

  it("writes nothing and returns null when no token is granted", async () => {
    requestPushToken.mockResolvedValue(null);

    const result = await enablePush("uid-9");

    expect(result).toBeNull();
    expect(fcmAdd).not.toHaveBeenCalled();
  });
});

describe("disablePush", () => {
  it("deletes the token doc for the uid", async () => {
    await disablePush("uid-9", "tok-123");

    expect(fcmTokenRepositoryCtor).toHaveBeenCalledWith("uid-9");
    expect(fcmRemove).toHaveBeenCalledWith("tok-123");
  });

  it("revokes the physical FCM subscription, not just the Firestore doc", async () => {
    await disablePush("uid-9", "tok-123");

    expect(revokePushToken).toHaveBeenCalledTimes(1);
  });
});
