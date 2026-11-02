import { lazy, Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemberProfileBoundary } from "./member-profile-boundary";

const Broken = lazy(() => Promise.reject(new Error("stale chunk")));

describe("MemberProfileBoundary", () => {
  it("renders its children when nothing fails", () => {
    render(
      <MemberProfileBoundary onClose={vi.fn()}>
        <p>Perfil</p>
      </MemberProfileBoundary>,
    );
    expect(screen.getByText("Perfil")).toBeInTheDocument();
  });

  it("catches a chunk that will not load and offers a way out", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const onClose = vi.fn();
    render(
      <MemberProfileBoundary onClose={onClose}>
        <Suspense fallback={null}>
          <Broken />
        </Suspense>
      </MemberProfileBoundary>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo abrir el perfil.");
    expect(screen.getByRole("button", { name: "Recargar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
