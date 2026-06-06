import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";
import { MemberTable } from "./member-table";
import type { Member } from "../types/member";

const member: Member = {
  id: "m1",
  name: "Ana Pérez",
  email: "ana@jci.bo",
  role: "Presidenta",
  joinDate: Timestamp.fromDate(new Date("2021-03-01T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1992-07-01T00:00:00Z")),
  status: "Activo",
  profilePicture: null,
  totalPoints: 0,
  active: true,
  deletedAt: null,
};

describe("MemberTable", () => {
  it("renders the status as a badge and a name", () => {
    render(<MemberTable members={[member]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("calls onEdit when the edit action is used", async () => {
    const onEdit = vi.fn();
    render(<MemberTable members={[member]} onEdit={onEdit} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /editar a ana pérez/i }));
    expect(onEdit).toHaveBeenCalledWith(member);
  });

  it("shows an empty state when there are no members", () => {
    render(<MemberTable members={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no hay miembros/i)).toBeInTheDocument();
  });
});
