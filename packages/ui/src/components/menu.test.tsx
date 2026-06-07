import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu, MenuItem, MenuSeparator } from "./menu";
import { Dialog } from "./dialog";

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

  it("does not leave document.body unclickable after an item opens then closes a Dialog", async () => {
    function MenuWithDialog() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Menu trigger={<button aria-label="Open menu">⋯</button>}>
            <MenuItem onSelect={() => setOpen(true)}>Editar</MenuItem>
          </Menu>
          <Dialog open={open} onOpenChange={setOpen} title="Editar">
            <button onClick={() => setOpen(false)}>Cerrar</button>
          </Dialog>
        </>
      );
    }

    render(<MenuWithDialog />);
    await userEvent.click(screen.getByLabelText("Open menu"));
    await userEvent.click(screen.getByText("Editar")); // opens Dialog, closes menu
    expect(screen.getByText("Cerrar")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Cerrar")); // close Dialog
    await waitFor(() => expect(screen.queryByText("Cerrar")).not.toBeInTheDocument());

    expect(document.body.style.pointerEvents).not.toBe("none");
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
