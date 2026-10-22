// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Combobox } from "./combobox";
import { Sheet } from "./sheet";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "Alfa" },
  { value: "b", label: "Beta" },
];

function ComboboxInSheet({ onChange }: { onChange: (value: string | null) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Sheet open onOpenChange={vi.fn()} title="Editar">
      <Combobox
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </Sheet>
  );
}

// Sheet (react-dialog) and Combobox (react-popover + cmdk) must share ONE copy of Radix's
// dismissable-layer and focus-scope. With two copies the nested popover is unclickable
// and the modal focus trap steals focus from the search input.
describe("a Combobox inside a modal Sheet", () => {
  it("is clickable and typable, and selecting an option reports it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ComboboxInSheet onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /seleccionar/i }));
    const search = await screen.findByPlaceholderText("Buscar…");
    await user.type(search, "be");
    expect(search).toHaveValue("be");

    await user.click(await screen.findByText("Beta"));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
