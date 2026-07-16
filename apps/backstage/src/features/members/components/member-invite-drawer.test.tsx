import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { MemberInviteDrawer } from "./member-invite-drawer";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import { pickDate } from "../../../test/pick-date";

// The drawer's "Enviar acceso" checkbox is Admin-only; render as Admin so the
// provisioning path under test is available.
function renderWithAbility(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AbilityProvider claims={{ roles: ["Admin"], perms: ["manage:all"] }} uid="admin">
        {children}
      </AbilityProvider>
    ),
  });
}

async function fill() {
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Ana Gómez" } });
  fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: "ana@jci.bo" } });
  fireEvent.click(screen.getByRole("button", { name: "Femenino" }));
  await pickDate(/Fecha de nacimiento/, "1990-01-15");
}

describe("MemberInviteDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks submit and stays on the form when required fields are empty", async () => {
    const onCreate = vi.fn();
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={onCreate}
        onProvision={async () => ({ email: "", actionLink: "", emailSent: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() =>
      expect(screen.getAllByText("Mínimo 3 caracteres.").length).toBeGreaterThan(0),
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates the member then provisions login when access is checked, reaching done", async () => {
    const onCreate = vi.fn().mockResolvedValue("new-id");
    const onProvision = vi.fn().mockResolvedValue({
      email: "ana@jci.bo",
      actionLink: "https://example.com/link",
      emailSent: true,
    });
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={onCreate}
        onProvision={onProvision}
      />,
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onProvision).toHaveBeenCalledWith("new-id");
    expect(screen.getByText(/Invitación enviada a ana@jci\.bo/)).toBeInTheDocument();
    expect(screen.getByText(/recibirá un correo/i)).toBeInTheDocument();
    // The invite email is enqueued server-side; the manual copy link stays as a fallback.
    expect(screen.getByRole("button", { name: "Copiar enlace de acceso" })).toBeInTheDocument();
  });

  it("skips provisioning when access is unchecked", async () => {
    const onProvision = vi.fn().mockResolvedValue({
      email: "ana@jci.bo",
      actionLink: "https://example.com/link",
      emailSent: true,
    });
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id2"}
        onProvision={onProvision}
      />,
    );
    await fill();
    fireEvent.click(screen.getByLabelText("Enviar acceso a la app"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument());
    expect(onProvision).not.toHaveBeenCalled();
    expect(screen.getByText(/Aún no tiene acceso/)).toBeInTheDocument();
  });

  it("shows the invite-sent confirmation when provisioning succeeds", async () => {
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id3"}
        onProvision={async () => ({
          email: "ana@jci.bo",
          actionLink: "https://example.com/link",
          emailSent: true,
        })}
      />,
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() =>
      expect(screen.getByText(/Invitación enviada a ana@jci\.bo/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/recibirá un correo para crear su contraseña/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns and offers the manual link when provisioned but the email failed", async () => {
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id5"}
        onProvision={async () => ({
          email: "ana@jci.bo",
          actionLink: "https://example.com/link",
          emailSent: false,
        })}
      />,
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/el correo no se pudo enviar/i);
    expect(screen.getByRole("button", { name: "Copiar enlace de acceso" })).toBeInTheDocument();
  });

  it("falls back to the no-access screen with a detail when provisioning fails", async () => {
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id4"}
        onProvision={async () => {
          throw new Error("App Check token invalid");
        }}
      />,
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText(/Aún no tiene acceso/)).toBeInTheDocument());
    expect(screen.getByText(/App Check token invalid/)).toBeInTheDocument();
  });
});
