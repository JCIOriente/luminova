import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { roleClaims } from "@luminova/auth/test-helpers";
import type { AuthClaims } from "@luminova/auth/roles";
import { AbilityProvider, Can } from "./ability-context";

function renderWith(claims: AuthClaims) {
  return render(
    <AbilityProvider claims={claims} uid="self">
      <Can I="create" a="Member">
        <span>can-create-member</span>
      </Can>
    </AbilityProvider>,
  );
}

describe("AbilityProvider + Can", () => {
  it("renders the children for Membership", () => {
    renderWith(roleClaims("Membership"));
    expect(screen.getByText("can-create-member")).toBeTruthy();
  });

  it("renders nothing for a plain Member", () => {
    renderWith({ roles: ["Member"] });
    expect(screen.queryByText("can-create-member")).toBeNull();
  });
});

// A bare `<Can I="update" a="Member">` used to ask CASL a TYPE-level question, which is
// true whenever ANY rule for that subject exists — including a plain Member's own-doc
// `can('update','Member',{uid})`. That showed every member the row menu's Editar /
// Desactivar / Desafiliar on EVERY row, all of which firestore.rules deny. The gate now
// probes an EMPTY instance, so it answers only the collection-level question.
describe("Can — conditional grants must not satisfy a collection gate", () => {
  function renderUpdateGate(claims: AuthClaims) {
    return render(
      <AbilityProvider claims={claims} uid="self">
        <Can I="update" a="Member">
          <span>can-update</span>
        </Can>
      </AbilityProvider>,
    );
  }

  it("denies a plain Member holding only the uid-scoped own-doc grant", () => {
    renderUpdateGate({ roles: ["Member"] });
    expect(screen.queryByText("can-update")).toBeNull();
  });

  it("still allows an unconditional update:Member holder", () => {
    renderUpdateGate(roleClaims("Membership"));
    expect(screen.getByText("can-update")).toBeTruthy();
  });
});
