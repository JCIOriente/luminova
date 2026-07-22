import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

const mutate = vi.fn();

vi.mock("../hooks/use-sent-notifications", () => ({
  useSentNotifications: () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../hooks/use-compose-notification", () => ({
  useComposeNotification: () => ({ mutate, isPending: false }),
}));
vi.mock("../../permissions/hooks/use-roles", () => ({
  useRoles: () => ({ data: [], isLoading: false }),
}));

import { NotificationsPage } from "./notifications-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

const FULL_ACCESS: AuthClaims = {
  roles: [],
  perms: ["create:Notification", "read:Notification"],
};

function renderWith(claims: AuthClaims, ui: ReactElement) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("NotificationsPage — access gate", () => {
  it("fences out a principal without create:Notification or read:Notification", () => {
    renderWith({ roles: ["Member"] }, <NotificationsPage />);
    expect(screen.getByText(/acceso restringido/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Notificaciones$/)).not.toBeInTheDocument();
  });

  it("renders the compose form + history for an authorized principal", () => {
    renderWith(FULL_ACCESS, <NotificationsPage />);
    expect(screen.queryByText(/acceso restringido/i)).not.toBeInTheDocument();
    expect(screen.getByText(/envía un aviso a los miembros/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Título/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar notificación/i })).toBeInTheDocument();
    expect(screen.getByText(/^Enviadas$/)).toBeInTheDocument();
  });
});

describe("NotificationsPage — compose submit", () => {
  it("submits a valid composition through the mutation", async () => {
    mutate.mockClear();
    renderWith(FULL_ACCESS, <NotificationsPage />);

    fireEvent.change(screen.getByLabelText(/^Título/), { target: { value: "Aviso" } });
    fireEvent.change(screen.getByLabelText(/^Mensaje/), { target: { value: "Hola a todos" } });
    fireEvent.submit(screen.getByRole("button", { name: /enviar notificación/i }));

    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    const [payload] = mutate.mock.calls[0]!;
    expect(payload).toMatchObject({
      title: "Aviso",
      body: "Hola a todos",
      url: null,
      audience: { type: "everyone" },
    });
  });
});
