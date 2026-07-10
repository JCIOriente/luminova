import { describe, expect, it } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { Route } from "./programas.index";

describe("/programas", () => {
  it("redirects to /impacto", () => {
    expect.assertions(2);
    try {
      Route.options.beforeLoad!({} as never);
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      expect((e as { options: { to: string } }).options.to).toBe("/impacto");
    }
  });
});
