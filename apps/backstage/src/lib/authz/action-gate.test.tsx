import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthClaims } from "@luminova/auth/roles";
import { AbilityProvider } from "./ability-context";
import { ActionGate, DisabledReason } from "./action-gate";
import type { ReactNode } from "react";

function withClaims(claims: AuthClaims, children: ReactNode) {
  return render(
    <AbilityProvider claims={claims} uid="self">
      {children}
    </AbilityProvider>,
  );
}

describe("ActionGate", () => {
  it("renders children when the perm gate passes, hides otherwise", () => {
    withClaims(
      { roles: ["Membership"], perms: ["create:Ally"] },
      <ActionGate can={{ action: "create", subject: "Ally" }}>
        <span>add-ally</span>
      </ActionGate>,
    );
    expect(screen.getByText("add-ally")).toBeTruthy();
  });

  it("hides children when the perm gate fails", () => {
    withClaims(
      { roles: ["Membership"], perms: ["read:Ally"] },
      <ActionGate can={{ action: "create", subject: "Ally" }} fallback={<span>nope</span>}>
        <span>add-ally</span>
      </ActionGate>,
    );
    expect(screen.queryByText("add-ally")).toBeNull();
    expect(screen.getByText("nope")).toBeTruthy();
  });

  it("gates on the roles claim independently of perms (manage:all perm ≠ Admin role)", () => {
    withClaims(
      { roles: ["Membership"], perms: ["manage:all"] },
      <ActionGate role={["Admin"]}>
        <span>admin-only</span>
      </ActionGate>,
    );
    expect(screen.queryByText("admin-only")).toBeNull();
  });

  it("ANDs `when` with the other gates", () => {
    withClaims(
      { roles: ["Admin"] },
      <ActionGate role={["Admin"]} when={false}>
        <span>blocked-by-state</span>
      </ActionGate>,
    );
    expect(screen.queryByText("blocked-by-state")).toBeNull();
  });
});

describe("DisabledReason", () => {
  it("passes the child through untouched when not blocked", () => {
    render(
      <DisabledReason when={false} reason="locked">
        <button type="button">save</button>
      </DisabledReason>,
    );
    expect(screen.getByRole("button", { name: "save" }).hasAttribute("disabled")).toBe(false);
  });

  it("disables the child and surfaces the reason when blocked", () => {
    render(
      <DisabledReason when reason="Solo Admin/ProjectManager" inline>
        <button type="button">save</button>
      </DisabledReason>,
    );
    expect(screen.getByRole("button", { name: "save" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Solo Admin/ProjectManager")).toBeTruthy();
  });
});
