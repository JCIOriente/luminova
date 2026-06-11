import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemberInviteDrawer } from "./member-invite-drawer";

vi.mock("../../../lib/auth/request-password-reset", () => ({
  requestPasswordReset: vi.fn().mockResolvedValue(undefined),
}));

import { requestPasswordReset } from "../../../lib/auth/request-password-reset";
const mockedRequestPasswordReset = vi.mocked(requestPasswordReset);

function fill() {
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Ana Gómez" } });
  fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: "ana@jci.bo" } });
  fireEvent.change(screen.getByLabelText(/Género/), { target: { value: "Femenino" } });
  fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), {
    target: { value: "1990-01-01" },
  });
}

describe("MemberInviteDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequestPasswordReset.mockResolvedValue(undefined);
  });

  it("blocks submit and stays on the form when required fields are empty", async () => {
    const onCreate = vi.fn();
    render(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={onCreate}
        onProvision={async () => ({ email: "", actionLink: "" })}
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
    const onProvision = vi
      .fn()
      .mockResolvedValue({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    render(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={onCreate}
        onProvision={onProvision}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onProvision).toHaveBeenCalledWith("new-id");
    expect(mockedRequestPasswordReset).toHaveBeenCalledWith("ana@jci.bo");
    expect(screen.getByText(/Invitación enviada a ana@jci\.bo/)).toBeInTheDocument();
    expect(screen.getByText(/recibirá un correo/i)).toBeInTheDocument();
  });

  it("skips provisioning when access is unchecked", async () => {
    const onProvision = vi
      .fn()
      .mockResolvedValue({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    render(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id2"}
        onProvision={onProvision}
      />,
    );
    fill();
    fireEvent.click(screen.getByLabelText("Enviar acceso a la app"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument());
    expect(onProvision).not.toHaveBeenCalled();
    expect(mockedRequestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByText(/Aún no tiene acceso/)).toBeInTheDocument();
  });

  it("shows email-sent copy when requestPasswordReset resolves", async () => {
    render(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id3"}
        onProvision={async () => ({ email: "ana@jci.bo", actionLink: "https://example.com/link" })}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() =>
      expect(screen.getByText(/Invitación enviada a ana@jci\.bo/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/recibirá un correo para crear su contraseña/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows warning and copy-link button when requestPasswordReset rejects", async () => {
    mockedRequestPasswordReset.mockRejectedValue(new Error("network error"));
    render(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id4"}
        onProvision={async () => ({
          email: "ana@jci.bo",
          actionLink: "https://example.com/action-link",
        })}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El correo no se pudo enviar. Comparte el enlace de acceso manualmente.",
    );
    expect(screen.getByRole("button", { name: "Copiar enlace de acceso" })).toBeInTheDocument();
  });
});
