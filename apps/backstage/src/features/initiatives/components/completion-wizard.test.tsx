import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompletionWizard } from "./completion-wizard";

const noop = () => Promise.resolve();

function renderWizard(onComplete = vi.fn()) {
  render(
    <CompletionWizard
      initiativeLabel="proyecto"
      isSaving={false}
      onComplete={onComplete}
      photos={[]}
      onUploadPhoto={noop}
      onRemovePhoto={noop}
      onSetCover={noop}
      onSetCaption={noop}
    />,
  );
  return onComplete;
}

describe("CompletionWizard", () => {
  it("blocks advancing to step 2 until closingSummary is valid", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(await screen.findByText(/mínimo 10 caracteres/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/personas impactadas/i)).not.toBeInTheDocument();
  });

  it("blocks advancing to step 3 when a required impact number is left blank", async () => {
    const user = userEvent.setup();
    const onComplete = renderWizard();
    await user.type(screen.getByLabelText(/resumen de cierre/i), "Cierre con impacto real.");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.clear(screen.getByLabelText(/personas impactadas/i));
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => expect(onComplete).not.toHaveBeenCalled());
    expect(screen.queryByText(/destacadas/i)).not.toBeInTheDocument();
  });

  it("blocks advancing to step 3 when a custom metric is left blank", async () => {
    const user = userEvent.setup();
    const onComplete = renderWizard();
    await user.type(screen.getByLabelText(/resumen de cierre/i), "Cierre con métrica vacía.");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.type(screen.getByLabelText(/personas impactadas/i), "10");
    await user.type(screen.getByLabelText(/voluntarios/i), "2");
    await user.click(screen.getByRole("button", { name: /agregar métrica/i }));
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => expect(onComplete).not.toHaveBeenCalled());
    expect(screen.queryByText(/destacadas/i)).not.toBeInTheDocument();
  });

  it("submits the full impact trio including a custom metric", async () => {
    const user = userEvent.setup();
    const onComplete = renderWizard();
    await user.type(screen.getByLabelText(/resumen de cierre/i), "Cerramos con gran impacto.");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.type(screen.getByLabelText(/personas impactadas/i), "120");
    await user.type(screen.getByLabelText(/voluntarios/i), "8");
    await user.click(screen.getByRole("button", { name: /agregar métrica/i }));
    await user.type(screen.getByLabelText(/etiqueta/i), "Juguetes entregados");
    await user.type(screen.getByLabelText(/valor/i), "1.200");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.click(screen.getByRole("button", { name: /finalizar/i }));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({
        closingSummary: "Cerramos con gran impacto.",
        personsImpacted: 120,
        volunteers: 8,
        custom: [{ label: "Juguetes entregados", value: "1.200" }],
      }),
    );
  });

  it("submits with zero photos (step 3 always submittable)", async () => {
    const user = userEvent.setup();
    const onComplete = renderWizard();
    await user.type(screen.getByLabelText(/resumen de cierre/i), "Cerramos sin fotos.");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.type(screen.getByLabelText(/personas impactadas/i), "50");
    await user.type(screen.getByLabelText(/voluntarios/i), "5");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(await screen.findByText(/destacadas/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /finalizar/i }));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({
        closingSummary: "Cerramos sin fotos.",
        personsImpacted: 50,
        volunteers: 5,
        custom: [],
      }),
    );
  });

  it("preserves the closing summary when navigating back from step 2", async () => {
    const user = userEvent.setup();
    renderWizard();
    const summary = screen.getByLabelText(/resumen de cierre/i);
    await user.type(summary, "Resumen que debe sobrevivir.");
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.click(screen.getByRole("button", { name: /atrás/i }));
    expect(screen.getByLabelText(/resumen de cierre/i)).toHaveValue("Resumen que debe sobrevivir.");
  });
});
