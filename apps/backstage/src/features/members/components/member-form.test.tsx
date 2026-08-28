import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MemberInput, Position } from "@luminova/types";
import { MemberForm } from "./member-form";
import { MINT_PENDING_NOTE_ID } from "./no-assignable-cargos-note";
import { toMemberUpdateDoc } from "../repositories/member-mapper";
import { pickDate } from "../../../test/pick-date";
import { permissionLabel } from "../../permissions/lib/permission-matrix";

// The note names the permission through `permissionLabel`, and its own comment says the two
// features must not drift. Assert against the same source, not a hardcoded copy — a literal
// here would keep passing after either half of the label is renamed, which is exactly the
// coupling the note is worried about.
const BOARD_SEAT_LABEL = permissionLabel("update:BoardSeat");

// The mint-pending note used to say "permisos de administrador", which was true only of its
// one original trigger. It now fires for a SELF-assignment of any granting cargo, so copy
// naming administrator permissions would be a lie in that case. Matched on the outcome half of
// the sentence, which is the part both triggers share.
const MINT_PENDING_COPY = /no se aplicarán hasta que un administrador confirme la asignación/i;

const positions: Position[] = [
  {
    id: "pos-pres",
    title: "Presidente",
    titleFemale: "Presidenta",
    category: "CEL",
    grants: [],
    term: null,
    sigla: null,
    description: "Preside el capítulo.",
    active: true,
    deletedAt: null,
  },
  {
    id: "pos-eventos",
    title: "Comisión de Eventos",
    titleFemale: "Comisión de Eventos",
    category: "Comision",
    grants: [],
    term: null,
    sigla: null,
    description: "Organiza los eventos.",
    active: true,
    deletedAt: null,
  },
  {
    id: "pos-jdl",
    title: "Director de Área",
    titleFemale: "Directora de Área",
    category: "JDL",
    grants: [],
    term: null,
    sigla: null,
    description: "Dirige un área.",
    active: true,
    deletedAt: null,
  },
];

const comisionWithSigla: Position = {
  id: "k1",
  sigla: "CCE",
  title: "Comisión de Conducta y Ética",
  titleFemale: null,
  category: "Comision",
  grants: [],
  term: null,
  description: "",
  active: true,
  deletedAt: null,
};

const inactiveCargoPosition: Position = {
  id: "pos-tesorero",
  title: "Tesorero",
  titleFemale: "Tesorera",
  category: "CEL",
  grants: [],
  term: null,
  description: "Gestiona las finanzas.",
  active: false,
  deletedAt: null,
};

describe("MemberForm", () => {
  it("blocks submit and shows an error when required fields are empty", async () => {
    const onSubmit = vi.fn();
    render(<MemberForm positions={[]} submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    expect(await screen.findAllByText("Mínimo 3 caracteres.")).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders the gender toggle and requires it on submit", async () => {
    const onSubmit = vi.fn();
    render(<MemberForm positions={[]} submitLabel="Crear" onSubmit={onSubmit} />);
    expect(screen.getByRole("group", { name: "Género" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@jci.bo");
    await pickDate(/fecha de ingreso/i, "2020-03-15");
    await pickDate(/fecha de nacimiento/i, "1992-07-15");
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    expect(await screen.findByText("Requerido.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // allowPowerGrants: pos-pres is a grant-free CEL cargo, which only an Admin may assign
  // (rules' cargoAssignableByNonAdmin). This case is about the LABELS, so give it the
  // authority that renders them all.
  it("shows gendered cargo labels and excludes comisiones from the cargo options", async () => {
    render(
      <MemberForm positions={positions} submitLabel="Crear" onSubmit={vi.fn()} allowPowerGrants />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Femenino" }));
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(await screen.findByText("Presidenta")).toBeInTheDocument();
    expect(screen.queryByText("Comisión de Eventos")).not.toBeInTheDocument();
  });

  // The empty-state the delegation exists to explain. A chapter whose every cargo carries
  // grants (which is the real production shape) leaves a non-delegate with zero options, and
  // the bare Combobox "Sin resultados" cannot be told apart from an empty catalog.
  it("explains an empty cargo list to a non-delegate, and stays silent for a delegate", async () => {
    const gatedCargo = (
      id: string,
      category: Position["category"],
      grants: Position["grants"],
    ): Position => ({
      id,
      title: id,
      titleFemale: id,
      category,
      grants,
      term: null,
      sigla: null,
      description: "",
      active: true,
      deletedAt: null,
    });
    const celOnly: Position[] = [
      gatedCargo("pos-cel", "CEL", []),
      gatedCargo("pos-power", "JDL", ["Membership"]),
    ];
    const { unmount } = render(
      <MemberForm
        positions={celOnly}
        submitLabel="Crear"
        onSubmit={vi.fn()}
        allowPowerGrants={false}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(BOARD_SEAT_LABEL);
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
    unmount();

    // The delegate sees the very same catalog as assignable, and no note.
    render(
      <MemberForm positions={celOnly} submitLabel="Crear" onSubmit={vi.fn()} allowPowerGrants />,
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(screen.queryByText("Sin resultados")).not.toBeInTheDocument();
  });

  // The admin half of memberSchemaFor: a member enrolled before memberNameValid() existed
  // must stay editable. Without the per-member schema the form blocks on a name the admin
  // never touched, making the rules' touched('name') affordance unreachable.
  it("lets an admin edit a member whose stored name predates the pattern", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberForm
        positions={[]}
        submitLabel="Guardar"
        onSubmit={onSubmit}
        defaultValues={{
          name: "Ana Rivas 2",
          email: "ana@jci.bo",
          gender: "Femenino",
          joinDate: "2020-03-15",
          birthdate: "1992-07-15",
          status: "Activo",
          cargoId: null,
          comisionIds: [],
        }}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/profesión/i));
    await userEvent.type(screen.getByLabelText(/profesión/i), "Ingeniera");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Verbatim: the rules must see no diff on name, so the gate never runs.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Ana Rivas 2" }));
  });

  it("still blocks an admin changing a legacy name to another invalid one", async () => {
    const onSubmit = vi.fn();
    render(
      <MemberForm
        positions={[]}
        submitLabel="Guardar"
        onSubmit={onSubmit}
        defaultValues={{
          name: "Ana Rivas 2",
          email: "ana@jci.bo",
          gender: "Femenino",
          joinDate: "2020-03-15",
          birthdate: "1992-07-15",
          status: "Activo",
          cargoId: null,
          comisionIds: [],
        }}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/nombre/i));
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Rivas 3");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByText(/Solo letras/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid data with the chosen cargo and comisiones", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MemberForm positions={positions} submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: "Femenino" }));
    await pickDate(/fecha de ingreso/i, "2020-03-15");
    await pickDate(/fecha de nacimiento/i, "1992-07-15");
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("Directora de Área"));
    await userEvent.click(screen.getByLabelText("Comisiones (pertenece a)"));
    await userEvent.click(await screen.findByText("Comisión de Eventos"));
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ana Pérez",
        email: "ana@jci.bo",
        gender: "Femenino",
        joinDate: "2020-03-15",
        birthdate: "1992-07-15",
        status: "Activo",
        cargoId: "pos-jdl",
        comisionIds: ["pos-eventos"],
      }),
    );
  });

  // allowPowerGrants for the same reason: picking a CEL cargo at all is an Admin flow.
  it("locks comisiones as Comité Ejecutivo Local and clears them for a CEL cargo", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberForm positions={positions} submitLabel="Crear" onSubmit={onSubmit} allowPowerGrants />,
    );
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: "Femenino" }));
    await pickDate(/fecha de ingreso/i, "2020-03-15");
    await pickDate(/fecha de nacimiento/i, "1992-07-15");
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("Presidenta"));
    expect(screen.getByText("Comité Ejecutivo Local")).toBeInTheDocument();
    expect(screen.queryByLabelText("Comisiones (pertenece a)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ cargoId: "pos-pres", comisionIds: [] }),
    );
  });

  it("groups fields under section headers", () => {
    render(<MemberForm positions={[]} submitLabel="Crear" onSubmit={async () => {}} />);
    expect(screen.getByText("Datos personales")).toBeInTheDocument();
    expect(screen.getByText("Membresía")).toBeInTheDocument();
  });

  it("renders a children slot before the submit button", () => {
    render(
      <MemberForm positions={[]} submitLabel="Crear" onSubmit={async () => {}}>
        <span>extra-slot</span>
      </MemberForm>,
    );
    expect(screen.getByText("extra-slot")).toBeInTheDocument();
  });

  it("shows inactive assigned cargo with (inactivo) suffix in combobox trigger", async () => {
    render(
      <MemberForm
        positions={[...positions, inactiveCargoPosition]}
        defaultValues={{ cargoId: inactiveCargoPosition.id, gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
      />,
    );
    expect(await screen.findByText("Tesorero (inactivo)")).toBeInTheDocument();
  });

  // Mirror of firestore.rules cargoAssignableByNonAdmin() on the CREATE lane
  // (createPositionsSafe applies the same predicate). Without it a non-Admin sees a
  // grant-free CEL cargo, picks 'Presidente', and the create 403s into a generic error.
  it("hides a grant-free CEL cargo from a non-Admin and keeps the JDL dirección", async () => {
    render(<MemberForm positions={positions} submitLabel="Crear" onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(await screen.findByText("Director de Área")).toBeInTheDocument();
    expect(screen.queryByText("Presidente")).not.toBeInTheDocument();
  });

  it("shows a grant-free CEL cargo to an Admin", async () => {
    render(
      <MemberForm positions={positions} submitLabel="Crear" onSubmit={vi.fn()} allowPowerGrants />,
    );
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(await screen.findByText("Presidente")).toBeInTheDocument();
  });

  // The lock, not just the option list: every save re-stamps the assigned cargoId, so a
  // non-Admin editing a member already seated on a grant-free CEL cargo is denied on the
  // positions slot. Locking it keeps the bio fields savable (the mapper omits the
  // unchanged slot) instead of failing the whole form with no explanation.
  // BLOCKING: the rules conjuncts are asymmetric. Keeping a grant-free CEL seat is denied
  // (`cargoAssignableByNonAdmin`), but CLEARING it is allowed on purpose —
  // `currentCargoGrantsEmpty()` is not category-gated, because denying it "would strand a
  // takedown behind an Admin". So the seat renders disabled rather than locked or dropped.
  const celSeated = {
    name: "Ana Pérez",
    email: "ana@jci.bo",
    gender: "Femenino" as const,
    joinDate: "2020-03-15",
    birthdate: "1992-07-15",
    status: "Activo" as const,
    cargoId: "pos-pres",
    comisionIds: [],
  };

  it("BLOCKING: does NOT lock a grant-free CEL seat — clearing it is the allowed takedown", () => {
    render(
      <MemberForm
        positions={positions}
        defaultValues={{ cargoId: "pos-pres", gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(/Solo un administrador puede cambiar el cargo/i),
    ).not.toBeInTheDocument();
  });

  // Dropping the seat from the options handed it to the `(inactivo)` fallback, which re-added
  // an ACTIVE cargo under an inactive label — and re-offered it to the very non-Admin whose
  // write the rules reject. The two member forms must answer the same rules predicate.
  it("BLOCKING: never labels the active grant-free CEL seat '(inactivo)' to a non-Admin", () => {
    render(
      <MemberForm
        positions={positions}
        defaultValues={{ cargoId: "pos-pres", gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
      />,
    );
    const trigger = screen.getByLabelText("Cargo");
    expect(trigger).toHaveTextContent("Presidente");
    expect(trigger).not.toHaveTextContent(/inactivo/i);
  });

  it("BLOCKING: reaches the takedown of a grant-free CEL seat and submits cargoId null", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberForm
        positions={positions}
        defaultValues={celSeated}
        submitLabel="Guardar"
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /quitar cargo/i }));
    expect(screen.getByLabelText("Cargo")).toHaveTextContent("Sin cargo");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cargoId: null }));
  });

  it("BLOCKING: a non-Admin cannot re-assign the grant-free CEL seat once cleared", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberForm
        positions={positions}
        defaultValues={celSeated}
        submitLabel="Guardar"
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /quitar cargo/i }));
    await userEvent.click(screen.getByLabelText("Cargo"));
    const seat = await screen.findByRole("option", { name: "Presidenta" });
    expect(seat).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(seat);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByLabelText("Cargo")).toHaveTextContent("Sin cargo");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cargoId: null }));
  });

  // The other half of "never submittable": leaving the seat untouched is the one state that
  // still carries the CEL cargoId out of the form, and it must never become a positions
  // WRITE. Asserted through the mapper the edit lane actually uses, not by inspection — the
  // form's safety here is entirely toMemberUpdateDoc omitting an unchanged slot.
  it("BLOCKING: an untouched CEL seat never reaches the positions write", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberForm
        positions={positions}
        defaultValues={celSeated}
        submitLabel="Guardar"
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [submitted] = onSubmit.mock.calls[0]! as [MemberInput];
    expect(submitted.cargoId).toBe("pos-pres");
    const doc = toMemberUpdateDoc(submitted, "uid-editor", {
      cargoId: "pos-pres",
      comisionIds: [],
    });
    expect(Object.keys(doc).some((key) => key.startsWith("positions."))).toBe(false);
  });

  it("does NOT lock a non-Admin editing a member on a grant-free JDL dirección", () => {
    render(
      <MemberForm
        positions={positions}
        defaultValues={{ cargoId: "pos-jdl", gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(/Solo un administrador puede cambiar el cargo/i),
    ).not.toBeInTheDocument();
  });

  // BLOCKING: the two rules conjuncts of positionsAssignmentSafe() are gated on DIFFERENT
  // principals. `update:BoardSeat` lifts the NEW side (cargoAssignableByNonAdmin, the cargo
  // written in) — which is what `allowPowerGrants` carries — but the OLD side
  // (currentCargoGrantsEmpty, the cargo being REPLACED) is Admin-ROLE only and is deliberately
  // NOT delegated. So the delegate is the one principal for whom both flags disagree, and the
  // form must still lock. While the lock was `!allowPowerGrants && locked(...)` this render
  // handed a delegate an open picker on a write the rules ALWAYS deny: render-then-403.
  const powerCargo: Position = {
    id: "pos-secre",
    title: "Secretario",
    titleFemale: "Secretaria",
    category: "CEL",
    grants: ["Secretary"],
    term: null,
    sigla: null,
    description: "Lleva las actas.",
    active: true,
    deletedAt: null,
  };

  it("BLOCKING: locks for a board-seat DELEGATE on a member seated on a power-granting cargo", () => {
    render(
      <MemberForm
        positions={[...positions, powerCargo]}
        defaultValues={{ cargoId: "pos-secre", gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
        allowPowerGrants
        allowReplacePowerCargo={false}
      />,
    );
    const trigger = screen.getByLabelText("Cargo");
    expect(trigger).toBeDisabled();
    const note = screen.getByText(/Solo un administrador puede cambiar el cargo/i);
    expect(note).toBeInTheDocument();
    // The note sits after the field in the DOM, so the association is the only way a
    // screen-reader user reaching a disabled trigger meets the reason.
    expect(trigger).toHaveAttribute("aria-describedby", note.id);
  });

  it("does NOT lock an Admin on that same power-granting seat", () => {
    render(
      <MemberForm
        positions={[...positions, powerCargo]}
        defaultValues={{ cargoId: "pos-secre", gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
        allowPowerGrants
        allowReplacePowerCargo
      />,
    );
    expect(screen.getByLabelText("Cargo")).not.toBeDisabled();
    expect(
      screen.queryByText(/Solo un administrador puede cambiar el cargo/i),
    ).not.toBeInTheDocument();
  });

  // ---- self-assignment: the second, disjoint refusal in resolveTrustedGrants ----
  //
  // BLOCKING: the finding. A delegate holding update:Member + update:BoardSeat opens THEIR OWN
  // profile and seats themselves on a vacant NON-Admin-granting power cargo. Every gate says
  // yes — boardSeatDelegate() permits the write, the seat publishes to the Directiva, the save
  // returns 200 — but `resolveTrustedGrants` computes `selfAssigned = assignedBy === memberUid`
  // and honors it only for an Admin, so no claim is minted. syncMemberClaims is a background
  // trigger, so no response carries the refusal; and while the warning keyed on
  // `grants.includes("Admin")` alone, a Secretario seat rendered NO note whatsoever.
  const pickSecretario = async () => {
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("Secretario"));
  };

  it("BLOCKING: warns a delegate seating THEMSELVES on a non-Admin power cargo", async () => {
    render(
      <MemberForm
        positions={[...positions, powerCargo]}
        defaultValues={{ cargoId: null, gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
        allowPowerGrants
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment
      />,
    );
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
    await pickSecretario();
    const note = screen.getByText(MINT_PENDING_COPY);
    expect(note.id).toBe(MINT_PENDING_NOTE_ID);
    // The note sits after the field in the DOM, so the association is the only way a
    // screen-reader user on the trigger meets it before committing the save.
    expect(screen.getByLabelText("Cargo")).toHaveAttribute(
      "aria-describedby",
      MINT_PENDING_NOTE_ID,
    );
    // The copy must not name administrator permissions: this cargo grants Secretary.
    expect(note).not.toHaveTextContent(/permisos de administrador/i);
  });

  it("BLOCKING: the SAME delegate on the SAME cargo for someone else stays silent", async () => {
    // The control that makes the case above about self-assignment and nothing else. Identical
    // props but `isSelfAssignment={false}`: update:BoardSeat DOES mint a Secretary seat for
    // another member, so a note here would be false and would train users past the real one.
    render(
      <MemberForm
        positions={[...positions, powerCargo]}
        defaultValues={{ cargoId: null, gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
        allowPowerGrants
        allowReplacePowerCargo={false}
        assignerIsAdmin={false}
        isSelfAssignment={false}
      />,
    );
    await pickSecretario();
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cargo")).not.toHaveAttribute("aria-describedby");
  });

  it("stays silent for an ADMIN seating themselves — they mint it", async () => {
    // `assignerIsAdmin` satisfies both arms of the trust gate, so self-assignment is not a
    // refusal for them. Without this cell the fix could be "warn on any self-assignment".
    render(
      <MemberForm
        positions={[...positions, powerCargo]}
        defaultValues={{ cargoId: null, gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
        allowPowerGrants
        allowReplacePowerCargo
        assignerIsAdmin
        isSelfAssignment
      />,
    );
    await pickSecretario();
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
  });

  // Both new props default to false, which is what keeps the ~20 renders above (and the
  // invite drawer, which passes only `assignerIsAdmin`) compiling. Pin the defaults: a
  // required `isSelfAssignment` would be a breaking prop, but a default of TRUE would put the
  // note on every create.
  it("defaults both new props to false rather than warning by accident", async () => {
    render(
      <MemberForm
        positions={[...positions, powerCargo]}
        defaultValues={{ cargoId: null, gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
        allowPowerGrants
      />,
    );
    await pickSecretario();
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
  });

  // BLOCKING: the takedown note now has an id and is the third arm of cargoNoteId(). While the
  // association was a two-branch ternary over noCargos/locked, a takedown-only editor got
  // `aria-describedby={undefined}`: the note rendered, sat AFTER the field in the DOM, and a
  // screen-reader user reaching a trigger whose seat option is disabled met no reason at all.
  it("BLOCKING: associates the takedown note with the trigger", () => {
    render(
      <MemberForm
        positions={positions}
        defaultValues={celSeated}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
      />,
    );
    const note = screen.getByText(/solo un administrador puede asignarlo/i);
    expect(note.id).toBeTruthy();
    expect(screen.getByLabelText("Cargo")).toHaveAttribute("aria-describedby", note.id);
    // Not the mint-pending id: a grant-free seat mints nothing to warn about, and the two
    // notes' ids must not be interchangeable.
    expect(note.id).not.toBe(MINT_PENDING_NOTE_ID);
  });

  it("renders comisión option as 'sigla — title' when sigla is present", async () => {
    render(
      <MemberForm
        positions={[...positions, comisionWithSigla]}
        submitLabel="Crear"
        onSubmit={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByLabelText("Comisiones (pertenece a)"));
    expect(await screen.findByText(/CCE — Comisión de Conducta y Ética/)).toBeInTheDocument();
  });
});
