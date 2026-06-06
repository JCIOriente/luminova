import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthClaims } from "@luminova/auth/roles";
import { AbilityProvider, Can } from "./ability-context";

function renderWith(claims: AuthClaims) {
  return render(
    <AbilityProvider claims={claims} uid="self">
      <Can I="create" a="Member">
        <span>can-create-member</span>
      </Can>
      <Can not I="create" a="Member">
        <span>cannot-create-member</span>
      </Can>
    </AbilityProvider>,
  );
}

describe("AbilityProvider + Can", () => {
  it("renders the allowed branch for Membership", () => {
    renderWith({ roles: ["Membership"] });
    expect(screen.getByText("can-create-member")).toBeTruthy();
    expect(screen.queryByText("cannot-create-member")).toBeNull();
  });

  it("renders the denied branch for a plain Member", () => {
    renderWith({ roles: ["Member"] });
    expect(screen.queryByText("can-create-member")).toBeNull();
    expect(screen.getByText("cannot-create-member")).toBeTruthy();
  });
});
