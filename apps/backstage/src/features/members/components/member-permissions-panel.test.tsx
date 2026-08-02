import { describe, expect, it } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RoleDefinition } from "@luminova/types";
import { roleKeys } from "../../permissions/hooks/role-keys";
import { MemberPermissionsPanel } from "./member-permissions-panel";

function render(ui: ReactElement, roleDocs?: RoleDefinition[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (roleDocs) client.setQueryData(roleKeys.all, roleDocs);
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("MemberPermissionsPanel", () => {
  it("falls back to the seed snapshot label when no role docs are loaded", () => {
    render(<MemberPermissionsPanel roles={["Admin", "Member"]} />);
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText("Acceso total a la plataforma.")).toBeInTheDocument();
    expect(screen.getByText("Miembro")).toBeInTheDocument();
  });

  it("renders the live role doc's name and description over the snapshot", () => {
    render(<MemberPermissionsPanel roles={["Admin"]} />, [
      {
        id: "Admin",
        name: "Administración General",
        description: "Manda en todo.",
        builtIn: true,
        builtInKey: "Admin",
        permissions: ["manage:all"],
        locked: true,
        active: true,
        deletedAt: null,
      },
    ]);
    expect(screen.getByText("Administración General")).toBeInTheDocument();
    expect(screen.getByText("Manda en todo.")).toBeInTheDocument();
  });

  it("renders a list with one item per role", () => {
    render(<MemberPermissionsPanel roles={["Admin", "Member"]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
