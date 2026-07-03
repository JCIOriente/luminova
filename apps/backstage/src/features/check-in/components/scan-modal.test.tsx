// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScanModal, type ScanResult } from "./scan-modal";

vi.mock("@luminova/ui/qr-scanner", () => ({
  QrScanner: () => <div data-testid="scanner" />,
}));

afterEach(cleanup);

function renderModal(overrides: Partial<Parameters<typeof ScanModal>[0]> = {}) {
  const props = {
    presentCount: 3,
    paused: false,
    scan: null,
    onScan: vi.fn(),
    onDismissScan: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ScanModal {...props} />);
  return props;
}

describe("ScanModal", () => {
  it("names the dialog via the sr-only title", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Lector de check-in" })).toBeInTheDocument();
  });

  it("moves initial focus inside the dialog (close button)", async () => {
    renderModal();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus());
  });

  it("closes on Escape", async () => {
    const { onClose } = renderModal();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus inside the dialog", async () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    await userEvent.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await userEvent.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("announces the scan result assertively", () => {
    const scan: ScanResult = { status: "success", title: "Registrado", name: "Ana" };
    renderModal({ scan });
    expect(screen.getByText("Registrado")).toHaveAttribute("aria-live", "assertive");
  });

  it("tapping the scan feedback continues scanning without closing", async () => {
    const scan: ScanResult = { status: "duplicate", title: "Ya registrado" };
    const { onDismissScan, onClose } = renderModal({ scan });
    await userEvent.click(screen.getByRole("button", { name: "Continuar escaneando" }));
    expect(onDismissScan).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
