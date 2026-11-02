import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { MemberShowcaseItem } from "@luminova/types/engine";
import { renderWithRouter } from "../test/showcase";
import { MemberProfileDialog } from "./member-profile-dialog";
import { validateMemberSearch } from "./member-search";
import { fetchMember } from "./member-showcase-firestore";

vi.mock("./member-showcase-firestore", () => ({ fetchMember: vi.fn() }));
const fetchMock = vi.mocked(fetchMember);

const member: MemberShowcaseItem = {
  id: "m1",
  name: "Ana Rojas",
  portraitUrl: "https://x/ana.jpg",
  profession: "Abogada",
  joinYear: 2019,
  bio: "Dirijo para aprender.",
  linkedinUrl: "https://www.linkedin.com/in/ana-rojas",
  isPastPresident: true,
  career: [
    { year: "2026", title: "Presidenta" },
    { year: "2024", title: "Secretaria" },
  ],
  projects: [
    { id: "p1", title: "Agua Segura", year: 2025, role: "Director", personsImpacted: 1200 },
    { id: "p2", title: "Feria Joven", year: 2024, role: "Team", personsImpacted: 0 },
  ],
};

function open(onClose = vi.fn()) {
  renderWithRouter(<MemberProfileDialog memberId="m1" onClose={onClose} />);
  return onClose;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("MemberProfileDialog", () => {
  it("shows the career, the projects and the member's own words", async () => {
    fetchMock.mockResolvedValue(member);
    open();
    expect(await screen.findByRole("heading", { name: "Ana Rojas" })).toBeInTheDocument();
    expect(screen.getByText("Presidenta · Gestión 2026")).toBeInTheDocument();
    expect(screen.getByText("“Dirijo para aprender.”")).toBeInTheDocument();
    expect(screen.getByText("Past President")).toBeInTheDocument();
    expect(screen.getByText("Secretaria")).toBeInTheDocument();
    expect(screen.getByText("1.200 personas impactadas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Agua Segura/ })).toHaveAttribute(
      "href",
      "/impacto/p1",
    );
    expect(screen.getByRole("link", { name: "LinkedIn de Ana Rojas" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("falls back to initials and omits what the member has not filled in", async () => {
    fetchMock.mockResolvedValue({
      ...member,
      portraitUrl: null,
      bio: null,
      linkedinUrl: null,
      isPastPresident: false,
      career: [],
      projects: [],
    });
    open();
    expect(await screen.findByRole("heading", { name: "Ana Rojas" })).toBeInTheDocument();
    expect(screen.getByText("AR")).toBeInTheDocument();
    expect(screen.getByText("Miembro")).toBeInTheDocument();
    expect(screen.queryByText("Trayectoria")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /LinkedIn/ })).not.toBeInTheDocument();
  });

  it("leaves a zero out of the stats", async () => {
    fetchMock.mockResolvedValue({ ...member, projects: [] });
    open();
    expect(await screen.findByText("años en JCI")).toBeInTheDocument();
    expect(screen.queryByText("proyectos dirigidos")).not.toBeInTheDocument();
  });

  it("says the profile is unavailable for an opted-out member", async () => {
    fetchMock.mockResolvedValue(null);
    open();
    expect(await screen.findByText("Este perfil no está disponible")).toBeInTheDocument();
  });

  it("surfaces a read failure and retries it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(member);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Ana Rojas" })).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("closes from the button", async () => {
    fetchMock.mockResolvedValue(member);
    const onClose = open();
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("validateMemberSearch", () => {
  it("keeps a plain id", () => {
    expect(validateMemberSearch({ miembro: "aB3_-x" })).toEqual({ miembro: "aB3_-x" });
  });

  it.each([["../secrets"], ["a/b"], [""], [42], ["x".repeat(129)]])("drops %s", (miembro) => {
    expect(validateMemberSearch({ miembro })).toEqual({});
  });
});
