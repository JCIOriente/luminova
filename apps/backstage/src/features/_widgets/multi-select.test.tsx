import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiSelect, type ComboboxOption } from "@luminova/ui";

const OPTS: ComboboxOption[] = [
  { value: "m1", label: "Ana Rivas" },
  { value: "m2", label: "Bruno Paz" },
  { value: "m3", label: "Carla Soto" },
];

function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <>
      <MultiSelect options={OPTS} value={value} onChange={setValue} placeholder="Elegir equipo" />
      <output data-testid="val">{value.join(",") || "none"}</output>
    </>
  );
}

describe("MultiSelect", () => {
  it("selects multiple options and removes one via its chip", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /elegir equipo/i }));
    await user.click(screen.getByText("Ana Rivas"));
    await user.click(screen.getByText("Carla Soto"));
    expect(screen.getByTestId("val")).toHaveTextContent("m1,m3");

    await user.click(screen.getByRole("button", { name: /quitar ana rivas/i }));
    expect(screen.getByTestId("val")).toHaveTextContent("m3");
  });
});
