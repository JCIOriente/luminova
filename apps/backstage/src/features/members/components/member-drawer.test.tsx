import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { MemberDrawer } from "./member-drawer";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

const m: Member = {
  id: "1",
  name: "Ana Gómez",
  email: "ana@j.bo",
  role: "Tesorera",
  joinDate: Timestamp.fromDate(new Date("2021-01-01T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
  status: "Activo",
  profilePicture: null,
  totalPoints: 7,
  active: true,
  deletedAt: null,
};

describe("MemberDrawer view mode", () => {
  it("shows the member summary and switches to edit", () => {
    const onEditMode = vi.fn();
    render(
      <MemberDrawer
        open
        mode="view"
        member={m}
        onClose={() => {}}
        onEditMode={onEditMode}
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByText("ana@j.bo")).toBeInTheDocument();
    expect(screen.getByText("2021")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Editar perfil"));
    expect(onEditMode).toHaveBeenCalled();
  });
});
