import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PositionInput, RoleDefinition } from "@luminova/types";
import { roleKeys } from "../../permissions/hooks/role-keys";
import { PositionForm } from "./position-form";

// PositionForm resolves its grant options from the live role docs via useRoles().
function render(ui: ReactElement, roleDocs?: RoleDefinition[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (roleDocs) client.setQueryData(roleKeys.all, roleDocs);
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("PositionForm", () => {
  it("renders all fields for an Admin caller (CEL default)", () => {
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Cargo *")).toBeInTheDocument();
    expect(screen.getByLabelText("Variante femenina (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría *")).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción *")).toBeInTheDocument();
    expect(screen.getByLabelText("Permisos que otorga")).toBeInTheDocument();
  });

  it("hides the term input for CEL and shows it for JDL", async () => {
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText("Gestión *")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Categoría *"), "JDL");
    expect(screen.getByLabelText("Gestión *")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Categoría *"), "CEL");
    expect(screen.queryByLabelText("Gestión *")).not.toBeInTheDocument();
  });

  it("does not render the grants editor when canEditGrants is false", () => {
    render(<PositionForm submitLabel="Crear" canEditGrants={false} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText("Permisos que otorga")).not.toBeInTheDocument();
    expect(screen.queryByText("Permisos")).not.toBeInTheDocument();
  });

  it("renders with defaultValues of existing JDL position showing term 2025", () => {
    render(
      <PositionForm
        submitLabel="Guardar"
        canEditGrants
        defaultValues={{
          category: "JDL",
          term: 2025,
          title: "Director de Miembro Individual",
          titleFemale: "Directora de Miembro Individual",
          description: "Acompaña a los miembros individuales.",
          grants: [],
        }}
        onSubmit={vi.fn()}
      />,
    );
    const termInput = screen.getByLabelText("Gestión *") as HTMLInputElement;
    expect(termInput).toBeInTheDocument();
    expect(termInput.value).toBe("2025");
  });

  it("JDL with cleared term input shows 'Requerido.' and does not call onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PositionForm
        submitLabel="Guardar"
        canEditGrants
        defaultValues={{
          category: "JDL",
          term: 2025,
          title: "Director de Miembro Individual",
          titleFemale: "Directora de Miembro Individual",
          description: "Acompaña a los miembros individuales.",
          grants: [],
        }}
        onSubmit={onSubmit}
      />,
    );
    const termInput = screen.getByLabelText("Gestión *");
    await userEvent.clear(termInput);
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(screen.getByText("Requerido.")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid comisión with term null and grants untouched", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    // canEditGrants, NOT false. With canEditGrants={false} this form starts on
    // EMPTY_NON_ADMIN (category already "Comision") AND renders the select `disabled`, so
    // the selectOptions below was a silent no-op and the assertion measured the default
    // — it passed without the interaction it names. An Admin form starts on CEL with the
    // select enabled, so selecting "Comision" is a real state change and the payload
    // assertion is about the onChange handler (term -> null, grants -> [], sigla kept).
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={onSubmit} />);
    await userEvent.selectOptions(screen.getByLabelText("Categoría *"), "Comision");
    await userEvent.type(screen.getByLabelText("Nombre *"), "Director de Ética");
    await userEvent.type(screen.getByLabelText("Sigla *"), "CCE");
    await userEvent.type(screen.getByLabelText("Descripción *"), "Vela por el código de ética.");
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Director de Ética",
        sigla: "CCE",
        category: "Comision",
        grants: [],
        term: null,
        description: "Vela por el código de ética.",
      }),
    );
  });
});

// The UI mirror of the non-Admin pin on the positions update/create arms in firestore.rules
// (`unchanged('grants') && unchanged('category') && (!boardSurfacingCategory() || unchanged
// title/titleFemale)`, and `!boardSurfacingCategory()` on create). It had NO tests: every
// case below is the render-then-die shape — a control the rules reject, offered as editable —
// or its inverse, a control the rules allow, locked for no reason.
describe("PositionForm mirrors the non-Admin catalog pins", () => {
  const boardCargo: Partial<PositionInput> = {
    category: "JDL",
    term: 2026,
    title: "Director de Prensa",
    titleFemale: "Directora de Prensa",
    description: "Prensa.",
    grants: [],
  };

  it("locks title and titleFemale for a non-Admin editing a board cargo", () => {
    // boardRank orders the public Directiva by the BASE title, so on a CEL/JDL cargo the
    // label is an authority field and the rules pin it. Editable here = a generic
    // "No se pudo guardar" on save.
    render(
      <PositionForm
        submitLabel="Guardar"
        canEditGrants={false}
        defaultValues={boardCargo}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Cargo *")).toBeDisabled();
    expect(screen.getByLabelText("Variante femenina (opcional)")).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent(/categoría o el nombre/i);
  });

  it("BLOCKING: still submits the pinned labels on a non-Admin board-cargo save", async () => {
    // The regression this exists for: `register("title", { disabled: true })` instead of a
    // `disabled` prop on the Input. RHF's own `disabled` option submits the field as
    // undefined, so every non-Admin save would post a doc with no title — zod rejects it
    // (min 3) and onSubmit is never reached, or, past zod, firestore.rules 403s it because
    // `unchanged('title')` compares a real title against null. Both halves asserted: the
    // form validates AND the pinned values ride along unchanged.
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PositionForm
        submitLabel="Guardar"
        canEditGrants={false}
        defaultValues={boardCargo}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText("Descripción *"), " y comunicación.");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Director de Prensa",
        titleFemale: "Directora de Prensa",
        category: "JDL",
      }),
    );
  });

  it("leaves a comisión's name editable for a non-Admin (a label there is not authority)", () => {
    // The inverse case, and the org-chart editor's legitimate use case per owner-op 1:
    // comisiones never reach boardGroupFromCategory, so the rules leave their labels open.
    // Locking them would be a UI-only denial with no rule behind it.
    render(
      <PositionForm
        submitLabel="Guardar"
        canEditGrants={false}
        defaultValues={{
          category: "Comision",
          sigla: "CP",
          title: "Comisión de Prensa",
          description: "Prensa.",
          grants: [],
          term: null,
        }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Nombre *")).toBeEnabled();
    expect(screen.getByLabelText("Sigla *")).toBeEnabled();
    expect(screen.getByRole("note")).toHaveTextContent(/solo un admin puede cambiar la categoría/i);
  });

  it("defaults a non-Admin CREATE to Comisión and locks the category select", () => {
    // `boardSurfacingCategory()` makes CEL/JDL creation Admin-only, so the blank non-Admin
    // form must not start on the CEL default and die on save. The select is disabled for
    // them on every form, create and edit alike — `category` is pinned either way.
    render(<PositionForm submitLabel="Crear" canEditGrants={false} onSubmit={vi.fn()} />);
    const category = screen.getByLabelText("Categoría *");
    expect(category).toBeDisabled();
    expect(category).toHaveValue("Comision");
    // A comisión is not a board cargo, so on this same form the labels stay open.
    expect(screen.getByLabelText("Nombre *")).toBeEnabled();
  });

  it("leaves the category select open for an Admin", () => {
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Categoría *")).toBeEnabled();
    expect(screen.getByLabelText("Cargo *")).toBeEnabled();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("PositionForm grant options are total", () => {
  it("still renders a stored grant whose role doc is not in the cache", () => {
    // The real-world consequence of deriving the option list from the doc list: MultiSelect
    // renders chips by filtering options against the stored value, so Tesorería would
    // silently vanish from the picker while `positions.grants` still carries it live.
    render(
      <PositionForm
        submitLabel="Guardar"
        canEditGrants
        defaultValues={{ title: "Tesorero", description: "Gestiona pagos.", grants: ["Treasury"] }}
        onSubmit={vi.fn()}
      />,
      [
        {
          id: "ProjectManager",
          name: "Proyectos",
          description: "",
          builtIn: true,
          builtInKey: "ProjectManager",
          permissions: [],
          locked: false,
          active: true,
          deletedAt: null,
        },
      ],
    );
    expect(screen.getByLabelText("Quitar Tesorería")).toBeInTheDocument();
  });
});

describe("PositionForm category-aware fields", () => {
  it("CEL shows feminine variant + permisos, no sigla", () => {
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn(async () => {})} />);
    expect(screen.getByLabelText(/variante femenina/i)).toBeInTheDocument();
    expect(screen.getByText(/permisos que otorga/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/sigla/i)).not.toBeInTheDocument();
  });
  it("Comisión shows sigla, hides feminine variant + permisos", async () => {
    const user = userEvent.setup();
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn(async () => {})} />);
    await user.selectOptions(screen.getByLabelText(/categoría/i), "Comision");
    expect(screen.getByLabelText(/sigla/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/variante femenina/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/permisos que otorga/i)).not.toBeInTheDocument();
  });
  it("suggests the derived feminine as placeholder", async () => {
    const user = userEvent.setup();
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn(async () => {})} />);
    await user.type(screen.getByLabelText(/^cargo/i), "Director");
    expect(screen.getByLabelText(/variante femenina/i)).toHaveAttribute("placeholder", "Directora");
  });
});
