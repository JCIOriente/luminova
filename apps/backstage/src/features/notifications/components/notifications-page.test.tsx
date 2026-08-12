import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";
import type { NotificationDoc, RoleDefinition } from "@luminova/types";

const mutate = vi.fn();

// Mutable so the lifecycle cases can vary the role list and the sent history without
// re-mocking per test; reset in beforeEach so no case leaks into the next.
const state = vi.hoisted(() => ({ roles: [] as unknown[], sent: [] as unknown[] }));

vi.mock("../hooks/use-sent-notifications", () => ({
  useSentNotifications: () => ({
    data: state.sent,
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
  useRoles: () => ({ data: state.roles, isLoading: false }),
}));

import { NotificationsPage } from "./notifications-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

const FULL_ACCESS: AuthClaims = {
  roles: [],
  perms: ["create:Notification", "read:Notification"],
};

const role = (over: Partial<RoleDefinition>): RoleDefinition => ({
  id: "r",
  name: "Rol",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: [],
  locked: false,
  active: true,
  deletedAt: null,
  ...over,
});

const sentTo = (roleId: string): NotificationDoc =>
  ({
    id: "n1",
    title: "Aviso",
    body: "Hola",
    url: null,
    audience: { type: "role", roleId },
    createdBy: "u",
    createdAt: { toDate: () => new Date("2026-01-01T12:00:00Z") },
    stats: null,
  }) as unknown as NotificationDoc;

beforeEach(() => {
  state.roles = [];
  state.sent = [];
});

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

describe("NotificationsPage — audience options", () => {
  it("BLOCKING: never offers a deactivated role as a notification audience", () => {
    // ComposeForm is an ASSIGNMENT surface: picking `role:<id>` targets whoever holds
    // that role. A deactivated role grants nothing, so composing to it is a message
    // aimed at an audience the admin believes has perms it does not have.
    state.roles = [
      role({ id: "c_live", name: "Comunicaciones" }),
      role({ id: "c_dead", name: "Comunicaciones Retirado", active: false }),
    ];
    renderWith(FULL_ACCESS, <NotificationsPage />);

    expect(screen.getByRole("option", { name: "Comunicaciones" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Comunicaciones Retirado" }),
    ).not.toBeInTheDocument();
  });

  it("still resolves a deactivated role's NAME in the sent history (display, not assignment)", () => {
    // SentHistory's byId map is deliberately UNfiltered: an already-sent message must
    // keep a readable audience label, not degrade to the raw doc id, once its role goes
    // out of service.
    state.roles = [role({ id: "c_dead", name: "Comunicaciones Retirado", active: false })];
    state.sent = [sentTo("c_dead")];
    renderWith(FULL_ACCESS, <NotificationsPage />);

    expect(screen.getByRole("cell", { name: "Comunicaciones Retirado" })).toBeInTheDocument();
    expect(screen.queryByText("c_dead")).not.toBeInTheDocument();
  });
});
