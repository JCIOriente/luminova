import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

vi.mock("../hooks/use-site-config", () => ({
  useSiteConfig: () => ({ data: null, isLoading: false, isError: false }),
}));
vi.mock("../hooks/use-update-site-config", () => ({
  useUpdateSiteConfig: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("./site-config-form", () => ({
  SiteConfigForm: () => <div data-testid="site-config-form" />,
}));

import { ConfigPage } from "./config-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("ConfigPage — Admin-role gate", () => {
  it("renders the editor for an Admin", () => {
    renderWith({ roles: ["Admin"], perms: ["manage:all"] }, <ConfigPage />);
    expect(screen.getByTestId("site-config-form")).toBeInTheDocument();
    expect(screen.queryByText(/solo un administrador/i)).not.toBeInTheDocument();
  });

  it("blocks a non-Admin (even with manage:all perm)", () => {
    renderWith({ roles: ["Member"], perms: ["manage:all"] }, <ConfigPage />);
    expect(screen.getByText(/solo un administrador puede editar/i)).toBeInTheDocument();
    expect(screen.queryByTestId("site-config-form")).not.toBeInTheDocument();
  });
});
