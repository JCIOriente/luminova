// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorState } from "./error-state";

afterEach(cleanup);

describe("ErrorState", () => {
  it("renders the title and description", () => {
    render(<ErrorState title="No se pudo cargar" description="Ocurrió un problema." />);
    expect(screen.getByText("No se pudo cargar")).toBeTruthy();
    expect(screen.getByText("Ocurrió un problema.")).toBeTruthy();
  });

  it("renders a Reintentar button and fires onRetry on click", async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Error" onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: "Reintentar" });
    await userEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("honors a custom retryLabel", () => {
    render(<ErrorState title="Error" onRetry={() => {}} retryLabel="Volver a intentar" />);
    expect(screen.getByRole("button", { name: "Volver a intentar" })).toBeTruthy();
  });

  it("renders no button when onRetry is omitted (permission-denied variant)", () => {
    render(<ErrorState title="Sin permiso" description="No tienes permiso." />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
