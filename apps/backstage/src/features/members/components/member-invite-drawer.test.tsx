import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemberInviteDrawer } from "./member-invite-drawer";

function fill() {
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Ana Gómez" } });
  fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: "ana@jci.bo" } });
  fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), {
    target: { value: "1990-01-01" },
  });
}

describe("MemberInviteDrawer", () => {
  it("disables submit until name, email and birthdate are valid", () => {
    render(
      <MemberInviteDrawer
        open
        onClose={() => {}}
        onCreate={async () => "x"}
        onProvision={async () => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Enviar invitación" })).toBeDisabled();
    fill();
    expect(screen.getByRole("button", { name: "Enviar invitación" })).toBeEnabled();
  });

  it("creates the member then provisions login when access is checked, reaching done", async () => {
    const onCreate = vi.fn().mockResolvedValue("new-id");
    const onProvision = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberInviteDrawer open onClose={() => {}} onCreate={onCreate} onProvision={onProvision} />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onProvision).toHaveBeenCalledWith("new-id");
    expect(screen.getByText(/recibirá un enlace/)).toBeInTheDocument();
  });

  it("skips provisioning when access is unchecked", async () => {
    const onProvision = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberInviteDrawer
        open
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
  });
});
