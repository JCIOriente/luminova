import { describe, expect, it } from "vitest";
import { loginSchema } from "./login-schema";

describe("loginSchema", () => {
  it("trims a padded email to the bare address", () => {
    const r = loginSchema.safeParse({ email: "  a@b.co  ", password: "x" });
    expect(r.success && r.data.email).toBe("a@b.co");
  });
  it("accepts any non-empty password, whatever its strength", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "weak" }).success).toBe(true);
  });
  it("rejects an empty password in Spanish", () => {
    const r = loginSchema.safeParse({ email: "a@b.co", password: "" });
    expect(r.success ? null : r.error.issues[0]?.message).toBe("Ingresa tu contraseña.");
  });
});
