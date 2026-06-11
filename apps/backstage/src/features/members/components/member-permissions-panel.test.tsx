import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberPermissionsPanel } from "./member-permissions-panel";

describe("MemberPermissionsPanel", () => {
  it("lists each effective role's Spanish label and description", () => {
    render(<MemberPermissionsPanel roles={["Admin", "Member"]} />);
    expect(screen.getByText("Administración")).toBeInTheDocument();
    expect(screen.getByText("Acceso total a la plataforma.")).toBeInTheDocument();
    expect(screen.getByText("Miembro")).toBeInTheDocument();
  });
  it("renders a list with one item per role", () => {
    render(<MemberPermissionsPanel roles={["Admin", "Member"]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
