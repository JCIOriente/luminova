import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu, MenuItem, MenuSeparator } from "./menu";

function Fixture({ onPick }: { onPick: (v: string) => void }) {
  return (
    <Menu trigger={<button aria-label="Open menu">⋯</button>}>
      <MenuItem onSelect={() => onPick("view")}>Ver</MenuItem>
      <MenuSeparator />
      <MenuItem danger onSelect={() => onPick("delete")}>
        Eliminar
      </MenuItem>
    </Menu>
  );
}

describe("Menu", () => {
  it("opens on trigger click and fires onSelect", async () => {
    const onPick = vi.fn();
    render(<Fixture onPick={onPick} />);
    await userEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByText("Ver")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Eliminar"));
    expect(onPick).toHaveBeenCalledWith("delete");
  });

  it("supports keyboard navigation (open highlights first item, arrow moves)", async () => {
    const onPick = vi.fn();
    render(<Fixture onPick={onPick} />);
    const trigger = screen.getByLabelText("Open menu");
    trigger.focus();
    await userEvent.keyboard("{Enter}"); // open — first item highlighted
    await userEvent.keyboard("{ArrowDown}"); // move to the second item
    await userEvent.keyboard("{Enter}"); // select it
    expect(onPick).toHaveBeenCalledWith("delete");
  });
});
