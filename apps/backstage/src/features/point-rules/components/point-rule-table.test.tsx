import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import type { PointRule } from "@luminova/types";
import type { Role } from "@luminova/auth/roles";
import { PointRuleTable } from "./point-rule-table";
import { AbilityProvider } from "../../../lib/authz/ability-context";

const rules: PointRule[] = [
  {
    id: "2026__DirectProgram",
    termId: "2026",
    code: "DirectProgram",
    points: 10,
    label: "Dirección de programa",
  },
  {
    id: "2026__AttendTM",
    termId: "2026",
    code: "AttendTM",
    points: 6,
    label: "Asistencia a TM (Local o Nacional)",
  },
];

function renderWith(roles: Role[], ui: ReactElement) {
  return render(
    <AbilityProvider claims={{ roles }} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("PointRuleTable", () => {
  it("renders every rule label and points value", () => {
    renderWith(["Admin"], <PointRuleTable rules={rules} onSave={vi.fn()} isSaving={false} />);
    expect(screen.getByText("Dirección de programa")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  });

  it("saves the edited points for a row (Admin)", async () => {
    const onSave = vi.fn();
    renderWith(["Admin"], <PointRuleTable rules={rules} onSave={onSave} isSaving={false} />);
    const input = screen.getByLabelText(/puntos de dirección de programa/i);
    await userEvent.clear(input);
    await userEvent.type(input, "12");
    await userEvent.click(screen.getByRole("button", { name: /guardar dirección de programa/i }));
    expect(onSave).toHaveBeenCalledWith("2026__DirectProgram", 12);
  });

  it("disables save when the value is unchanged or invalid", async () => {
    renderWith(["Admin"], <PointRuleTable rules={rules} onSave={vi.fn()} isSaving={false} />);
    const input = screen.getByLabelText(/puntos de dirección de programa/i);
    expect(screen.queryByRole("button", { name: /guardar dirección de programa/i })).toBeNull();
    await userEvent.clear(input);
    await userEvent.type(input, "-3");
    expect(screen.getByRole("button", { name: /guardar dirección de programa/i })).toBeDisabled();
  });

  it("renders read-only for a role without update access", () => {
    renderWith(["Treasury"], <PointRuleTable rules={rules} onSave={vi.fn()} isSaving={false} />);
    expect(screen.queryByLabelText(/puntos de dirección de programa/i)).toBeNull();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
