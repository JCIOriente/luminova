import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { InviteStateBadge } from "./invite-state-badge";

const NOW = new Date("2026-09-21T12:00:00Z").getTime();
const ts = (ms: number) => Timestamp.fromMillis(ms);

function member(invite: Record<string, unknown> | undefined, uid = "u1"): Member {
  return { uid, invite } as unknown as Member;
}

const pending = {
  status: "pending",
  kind: "initial",
  tokenHash: "a".repeat(64),
  issuedAt: ts(NOW - 1000),
  expiresAt: ts(new Date("2026-09-28T12:00:00Z").getTime()),
  issuedBy: "admin-uid",
  usedAt: null,
};

describe("InviteStateBadge", () => {
  it("renders the pending label WITH its expiry date", () => {
    // The date is the whole point of the pending badge: "vence el 28 de septiembre" is what
    // tells the operator whether to chase the member or re-issue.
    render(<InviteStateBadge member={member(pending)} now={NOW} />);
    expect(screen.getByText(/Pendiente/)).toBeInTheDocument();
    expect(screen.getByText(/28 sept 2026/)).toBeInTheDocument();
  });

  it("renders the used label with the date it was used", () => {
    render(
      <InviteStateBadge
        member={member({ ...pending, status: "used", usedAt: ts(NOW) })}
        now={NOW}
      />,
    );
    expect(screen.getByText(/Usada el 21 sept 2026/)).toBeInTheDocument();
  });

  it("renders the used label without a date when usedAt is missing", () => {
    // A projection written before usedAt existed, or a partial write. Must not render
    // "Usada el undefined".
    render(<InviteStateBadge member={member({ ...pending, status: "used" })} now={NOW} />);
    expect(screen.getByText("Usada")).toBeInTheDocument();
  });

  it("shows the ENTIRE pre-feature roster as having access, not as uninvited", () => {
    render(<InviteStateBadge member={member(undefined, "u1")} now={NOW} />);
    expect(screen.getByText("Con acceso")).toBeInTheDocument();
  });

  it("shows a never-invited member as uninvited", () => {
    render(<InviteStateBadge member={member(undefined, "")} now={NOW} />);
    expect(screen.getByText("Sin invitar")).toBeInTheDocument();
  });

  it("derives expired from the clock with no stored flag", () => {
    render(<InviteStateBadge member={member({ ...pending, expiresAt: ts(NOW - 1) })} now={NOW} />);
    expect(screen.getByText("Expirada")).toBeInTheDocument();
  });

  it("renders revoked", () => {
    render(<InviteStateBadge member={member({ ...pending, status: "revoked" })} now={NOW} />);
    expect(screen.getByText("Revocada")).toBeInTheDocument();
  });

  it("tells the operator to re-issue when a redemption FAILED", () => {
    // Distinct from used on purpose: the token burned and the password was never set, so a
    // green "Usada" would leave the member locked out with nobody aware.
    render(<InviteStateBadge member={member({ ...pending, status: "failed" })} now={NOW} />);
    expect(screen.getByText(/genera otro/i)).toBeInTheDocument();
  });
});
