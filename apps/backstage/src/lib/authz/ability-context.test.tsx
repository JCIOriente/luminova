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
      <Can not I="create" a="Member">
        <span>cannot-create-member</span>
      </Can>
    </AbilityProvider>,
  );
}

describe("AbilityProvider + Can", () => {
  it("renders the allowed branch for Membership", () => {
    renderWith(roleClaims("Membership"));
    expect(screen.getByText("can-create-member")).toBeTruthy();
    expect(screen.queryByText("cannot-create-member")).toBeNull();
  });

  it("renders the denied branch for a plain Member", () => {
    renderWith({ roles: ["Member"] });
    expect(screen.queryByText("can-create-member")).toBeNull();
    expect(screen.getByText("cannot-create-member")).toBeTruthy();
  });
});

// A bare `<Can I="update" a="Member">` used to ask CASL a TYPE-level question, which is
// true whenever ANY rule for that subject exists — including a plain Member's own-doc
// `can('update','Member',{uid})`. That showed every member the row menu's Editar /
// Desactivar / Desafiliar on EVERY row, all of which firestore.rules deny. The gate now
// probes an EMPTY instance by default (collection-level, mirroring the rules' unscoped
// allow) and takes `on` for the per-document question.
describe("Can — conditional grants must not satisfy a collection gate", () => {
  const SELF: AuthClaims = { roles: ["Member"] };

  function renderUpdateGate(claims: AuthClaims, on?: Record<string, unknown>) {
    return render(
      <AbilityProvider claims={claims} uid="self">
        <Can I="update" a="Member" on={on}>
          <span>can-update</span>
        </Can>
      </AbilityProvider>,
    );
  }

  it("denies a plain Member the collection-level update gate", () => {
    renderUpdateGate(SELF);
    expect(screen.queryByText("can-update")).toBeNull();
  });

  it("allows a plain Member the per-document gate on their OWN doc", () => {
    renderUpdateGate(SELF, { uid: "self" });
    expect(screen.getByText("can-update")).toBeTruthy();
  });

  it("denies a plain Member the per-document gate on SOMEONE ELSE's doc", () => {
    renderUpdateGate(SELF, { uid: "other" });
    expect(screen.queryByText("can-update")).toBeNull();
  });

  it("still allows an unconditional holder both the collection and per-document gate", () => {
    const collectionGate = renderUpdateGate(roleClaims("Membership"));
    expect(screen.getByText("can-update")).toBeTruthy();
    collectionGate.unmount();
    renderUpdateGate(roleClaims("Membership"), { uid: "other" });
    expect(screen.getByText("can-update")).toBeTruthy();
  });

  it("does not tag the caller's object with CASL subject metadata", () => {
    const doc = { uid: "self" };
    renderUpdateGate(SELF, doc);
    expect(Object.getOwnPropertyNames(doc)).toEqual(["uid"]);
  });
});
