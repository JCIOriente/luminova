import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermisosView } from "../features/positions/components/permisos-view";

it("renders a card per role with granting cargos and holders", () => {
  render(
    <PermisosView
      isLoading={false}
      rows={[
        { role: "Admin", grantingCargos: ["Presidente"], holders: [{ id: "m0", name: "Olivia" }] },
      ]}
    />,
  );
  expect(screen.getByText(/Administración/)).toBeInTheDocument();
  expect(screen.getByText(/Presidente/)).toBeInTheDocument();
  expect(screen.getByText(/Olivia/)).toBeInTheDocument();
});
