import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PushPrompt } from "./push-prompt";

const DISMISS_KEY = "jci.push.dismissed";

interface Env {
  permission?: NotificationPermission;
  userAgent?: string;
  standalone?: boolean;
  displayModeStandalone?: boolean;
  dismissed?: boolean;
}

function setup({
  permission = "default",
  userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120",
  standalone,
  displayModeStandalone = false,
  dismissed = false,
}: Env = {}) {
  vi.stubGlobal("Notification", { permission });
  const nav: Record<string, unknown> = { userAgent, serviceWorker: {} };
  if (standalone !== undefined) nav.standalone = standalone;
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: displayModeStandalone,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  localStorage.clear();
  if (dismissed) localStorage.setItem(DISMISS_KEY, "1");
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("PushPrompt", () => {
  it("renders on non-iOS with permission default and not dismissed", () => {
    setup();
    render(<PushPrompt />);
    expect(screen.getByText("Recibe avisos de JCI Oriente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument();
  });

  it("renders nothing when permission is already granted", () => {
    setup({ permission: "granted" });
    render(<PushPrompt />);
    expect(screen.queryByText("Recibe avisos de JCI Oriente")).not.toBeInTheDocument();
  });

  it("renders nothing on iOS when not running standalone (dead-end)", () => {
    setup({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari",
      standalone: false,
    });
    render(<PushPrompt />);
    expect(screen.queryByText("Recibe avisos de JCI Oriente")).not.toBeInTheDocument();
  });

  it("renders on iOS when installed as a standalone PWA", () => {
    setup({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari",
      standalone: true,
      displayModeStandalone: true,
    });
    render(<PushPrompt />);
    expect(screen.getByText("Recibe avisos de JCI Oriente")).toBeInTheDocument();
  });

  it("renders nothing when already dismissed", () => {
    setup({ dismissed: true });
    render(<PushPrompt />);
    expect(screen.queryByText("Recibe avisos de JCI Oriente")).not.toBeInTheDocument();
  });

  it("'Ahora no' dismisses the prompt and persists the dismissal", () => {
    setup();
    render(<PushPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(screen.queryByText("Recibe avisos de JCI Oriente")).not.toBeInTheDocument();
    expect(localStorage.getItem(DISMISS_KEY)).toBe("1");
  });
});
