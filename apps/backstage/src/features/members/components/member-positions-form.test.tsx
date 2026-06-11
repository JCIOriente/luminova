import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Position } from "@luminova/types";
import { MemberPositionsForm } from "./member-positions-form";

const pos = (id: string, category: Position["category"]): Position => ({
  id,
  title: id,
  titleFemale: id,
  category,
  grants: [],
  term: category === "JDL" ? 2026 : null,
  description: "",
  active: true,
  deletedAt: null,
});
const positions = [pos("dir", "JDL"), pos("etica", "Comision")];

describe("MemberPositionsForm", () => {
  it("submits the current cargo + comisiones unchanged when saved as-is", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberPositionsForm
        positions={positions}
        gender="Masculino"
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ cargoId: null, comisionIds: [] });
  });

  it("submits selected cargo and comisiones", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberPositionsForm
        positions={positions}
        gender="Masculino"
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("dir"));
    await userEvent.click(screen.getByLabelText("Comisiones"));
    await userEvent.click(await screen.findByText("etica"));
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ cargoId: "dir", comisionIds: ["etica"] });
  });

  it("labels comisión options by sigla, never a gendered title (female member)", async () => {
    const cce: Position = {
      id: "cce",
      title: "Comisión de Conducta y Ética",
      titleFemale: null,
      sigla: "CCE",
      category: "Comision",
      grants: [],
      term: null,
      description: "",
      active: true,
      deletedAt: null,
    };
    render(
      <MemberPositionsForm
        positions={[cce]}
        gender="Femenino"
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Comisiones"));
    expect(await screen.findByText("CCE — Comisión de Conducta y Ética")).toBeInTheDocument();
    expect(screen.queryByText(/Comisióna/)).not.toBeInTheDocument();
  });

  it("shows error alert when onSubmit throws", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <MemberPositionsForm
        positions={positions}
        gender="Masculino"
        defaultValues={{ cargoId: null, comisionIds: [] }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
