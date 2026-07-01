import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthClaims } from "@luminova/auth/roles";
import type { ReactNode } from "react";
import { AbilityProvider } from "./ability-context";
import { ActionGate } from "./action-gate";

function withClaims(claims: AuthClaims, children: ReactNode) {
  return render(
    <AbilityProvider claims={claims} uid="self">
      {children}
    </AbilityProvider>,
  );
}

describe("ActionGate", () => {
  it("renders children when the role gate passes", () => {
    withClaims(
      { roles: ["Admin"] },
      <ActionGate role={["Admin"]}>
        <span>admin-only</span>
      </ActionGate>,
    );
    expect(screen.getByText("admin-only")).toBeTruthy();
  });

  it("gates on the roles claim independently of perms (manage:all perm ≠ Admin role)", () => {
    withClaims(
      { roles: ["Membership"], perms: ["manage:all"] },
      <ActionGate role={["Admin"]} fallback={<span>nope</span>}>
        <span>admin-only</span>
      </ActionGate>,
    );
    expect(screen.queryByText("admin-only")).toBeNull();
    expect(screen.getByText("nope")).toBeTruthy();
  });

  it("ANDs `when` with the role gate", () => {
    withClaims(
      { roles: ["Admin"] },
      <ActionGate role={["Admin"]} when={false}>
        <span>blocked-by-state</span>
      </ActionGate>,
    );
    expect(screen.queryByText("blocked-by-state")).toBeNull();
  });
});
