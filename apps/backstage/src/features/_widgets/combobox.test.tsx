import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox, type ComboboxOption } from "@luminova/ui";

const OPTS: ComboboxOption[] = [
  { value: "p1", label: "Programa Alpha" },
  { value: "p2", label: "Programa Beta" },
];

function Harness() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <Combobox options={OPTS} value={value} onChange={setValue} placeholder="Elegir programa" />
      <output data-testid="val">{value ?? "none"}</output>
    </>
  );
}

describe("Combobox", () => {
  it("opens, filters by search, and selects an option", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText("Elegir programa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /elegir programa/i }));
    await user.type(screen.getByPlaceholderText("Buscar…"), "Beta");

    expect(screen.queryByText("Programa Alpha")).not.toBeInTheDocument();
    await user.click(screen.getByText("Programa Beta"));

    expect(screen.getByTestId("val")).toHaveTextContent("p2");
  });
});
