import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { MemberMilestones } from "./member-milestones";

const now = new Date("2026-07-05T16:00:00Z"); // Bolivia Jul 5, 2026

function member(
  id: string,
  name: string,
  birthIso: string,
  joinIso: string,
  active = true,
): Member {
  return {
    id,
    name,
    active,
    birthdate: Timestamp.fromDate(new Date(birthIso)),
    joinDate: Timestamp.fromDate(new Date(joinIso)),
  } as unknown as Member;
}

const self = member("self", "Yo", "1990-07-10T00:00:00Z", "2020-03-15T00:00:00Z");

const base = {
  member: self,
  membersLoading: false,
  membersError: false,
  membersErrorValue: null,
  onRetryMembers: vi.fn(),
  now,
};

describe("MemberMilestones", () => {
  it("shows own birthday countdown and membership years", () => {
    render(<MemberMilestones {...base} members={[self]} />);
    expect(screen.getByText("Tu cumpleaños en 5 días")).toBeInTheDocument();
    expect(screen.getByText("6 años como miembro")).toBeInTheDocument();
  });

  it("lists fellow members' upcoming birthdays without a year", () => {
    render(
      <MemberMilestones
        {...base}
        members={[self, member("a", "Ana", "1992-07-08T00:00:00Z", "2021-01-01T00:00:00Z")]}
      />,
    );
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText(/8.*jul/i)).toBeInTheDocument();
    expect(screen.queryByText(/1992/)).not.toBeInTheDocument();
  });

  it("caps the list at three birthdays", () => {
    render(
      <MemberMilestones
        {...base}
        members={[
          self,
          member("a", "Ana", "1992-07-08T00:00:00Z", "2021-01-01T00:00:00Z"),
          member("b", "Beto", "1988-07-09T00:00:00Z", "2021-01-01T00:00:00Z"),
          member("c", "Cinthia", "1995-07-11T00:00:00Z", "2021-01-01T00:00:00Z"),
          member("d", "Dario", "1991-07-12T00:00:00Z", "2021-01-01T00:00:00Z"),
        ]}
      />,
    );
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Cinthia")).toBeInTheDocument();
    expect(screen.queryByText("Dario")).not.toBeInTheDocument();
  });

  it("says why the list is empty when the account can't read the directory", () => {
    render(<MemberMilestones {...base} members={undefined} membersLoading membersUnavailable />);
    expect(screen.getByText(/no tiene acceso al directorio/i)).toBeInTheDocument();
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
  });

  it("shows an error state distinct from empty when the members query fails", () => {
    render(
      <MemberMilestones
        {...base}
        members={undefined}
        membersError
        membersErrorValue={new Error("boom")}
      />,
    );
    expect(screen.getByText("No se pudo cargar")).toBeInTheDocument();
    expect(screen.queryByText("Sin cumpleaños próximos.")).not.toBeInTheDocument();
  });
});
