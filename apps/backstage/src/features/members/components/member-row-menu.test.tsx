import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { MemberRowMenu } from "./member-row-menu";

vi.mock("../../../lib/authz/ability-context", () => ({
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../lib/authz/action-gate", () => ({
  ActionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function member(p: Partial<Member>): Member {
  return {
    id: "1",
    name: "Ana",
    email: "a@j.bo",
    joinDate: Timestamp.now(),
    birthdate: Timestamp.now(),
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
    ...p,
  };
}

const noop = () => {};
const handlers = {
  onView: noop,
  onEdit: noop,
  onProvision: noop,
  onSetStatus: noop,
  onDelete: noop,
};

describe("MemberRowMenu", () => {
  it("shows Desactivar for an active member and Invitar when no uid", async () => {
    render(<MemberRowMenu member={member({ status: "Activo" })} {...handlers} />);
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.getByText("Desactivar")).toBeInTheDocument();
    expect(screen.getByText("Invitar a la app")).toBeInTheDocument();
    expect(screen.queryByText("Reactivar")).not.toBeInTheDocument();
  });

  it("shows Reactivar + Reenviar for an inactive member with uid", async () => {
    render(<MemberRowMenu member={member({ status: "Inactivo", uid: "u1" })} {...handlers} />);
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.getByText("Reactivar")).toBeInTheDocument();
    expect(screen.getByText("Reenviar invitación")).toBeInTheDocument();
    expect(screen.queryByText("Desactivar")).not.toBeInTheDocument();
  });

  it("fires onSetStatus with Desafiliado from the Desafiliar item", async () => {
    const onSetStatus = vi.fn();
    const m = member({ status: "Activo" });
    render(<MemberRowMenu member={m} {...handlers} onSetStatus={onSetStatus} />);
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    await userEvent.click(screen.getByText("Desafiliar"));
    expect(onSetStatus).toHaveBeenCalledWith(m, "Desafiliado");
  });
});
