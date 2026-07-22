import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@luminova/firebase", () => ({
  getFirebase: () => ({ auth: { currentUser: { uid: "uid-1" } } }),
}));

import { PushPrompt } from "./push-prompt";

function setPermission(permission: NotificationPermission) {
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: { permission },
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "Notification");
});

describe("PushPrompt", () => {
  it("renders the opt-in card when permission is default and not dismissed", () => {
    setPermission("default");
    render(<PushPrompt />);
    expect(screen.getByText("Activa las notificaciones")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument();
  });

  it("renders nothing when permission is already granted", () => {
    setPermission("granted");
    render(<PushPrompt />);
    expect(screen.queryByText("Activa las notificaciones")).not.toBeInTheDocument();
  });

  it("renders nothing when the prompt was previously dismissed", () => {
    setPermission("default");
    localStorage.setItem("backstage.push.prompt.dismissed", "1");
    render(<PushPrompt />);
    expect(screen.queryByText("Activa las notificaciones")).not.toBeInTheDocument();
  });

  it("dismisses and persists on 'Ahora no'", async () => {
    setPermission("default");
    const user = userEvent.setup();
    render(<PushPrompt />);

    await user.click(screen.getByRole("button", { name: "Ahora no" }));

    expect(screen.queryByText("Activa las notificaciones")).not.toBeInTheDocument();
    expect(localStorage.getItem("backstage.push.prompt.dismissed")).toBe("1");
  });
});
