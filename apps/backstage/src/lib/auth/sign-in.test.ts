import { describe, it, expect, vi, beforeEach } from "vitest";

const setPersistence = vi.fn<(auth: unknown, persistence: unknown) => Promise<void>>();
const signInWithEmailAndPassword =
  vi.fn<(auth: unknown, email: string, password: string) => Promise<void>>();
vi.mock("firebase/auth", () => ({
  setPersistence: (auth: unknown, persistence: unknown) => setPersistence(auth, persistence),
  signInWithEmailAndPassword: (auth: unknown, email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password),
  browserLocalPersistence: { type: "LOCAL" },
  browserSessionPersistence: { type: "SESSION" },
}));
vi.mock("@luminova/firebase", () => ({ getFirebase: () => ({ auth: { id: "auth" } }) }));

import { signIn } from "./sign-in";
import { browserLocalPersistence, browserSessionPersistence } from "firebase/auth";

describe("signIn", () => {
  beforeEach(() => {
    setPersistence.mockClear();
    signInWithEmailAndPassword.mockClear();
  });

  it("uses local persistence when remember is true", async () => {
    await signIn("a@b.co", "pw", true);
    expect(setPersistence).toHaveBeenCalledWith({ id: "auth" }, browserLocalPersistence);
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith({ id: "auth" }, "a@b.co", "pw");
  });

  it("uses session persistence when remember is false", async () => {
    await signIn("a@b.co", "pw", false);
    expect(setPersistence).toHaveBeenCalledWith({ id: "auth" }, browserSessionPersistence);
  });
});
