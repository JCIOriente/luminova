import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette, type CommandItem } from "./command-palette";

function items(overrides: Partial<CommandItem>[] = []): CommandItem[] {
  const base: CommandItem[] = [
    { id: "home", label: "Inicio", group: "Navegación", onSelect: vi.fn() },
    { id: "members", label: "Miembros", group: "Navegación", onSelect: vi.fn() },
    { id: "create", label: "Crear evento", group: "Acciones", onSelect: vi.fn() },
  ];
  return base.map((item, i) => ({ ...item, ...overrides[i] }));
}

describe("CommandPalette", () => {
  it("renders group headings and items when open", () => {
    render(<CommandPalette open onOpenChange={vi.fn()} items={items()} />);
    expect(screen.getByText("Navegación")).toBeInTheDocument();
    expect(screen.getByText("Acciones")).toBeInTheDocument();
    expect(screen.getByText("Inicio")).toBeInTheDocument();
    expect(screen.getByText("Crear evento")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(<CommandPalette open={false} onOpenChange={vi.fn()} items={items()} />);
    expect(screen.queryByText("Inicio")).toBeNull();
  });

  it("filters items as the user types", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} items={items()} />);
    await userEvent.type(screen.getByRole("combobox"), "miemb");
    expect(screen.getByText("Miembros")).toBeInTheDocument();
    expect(screen.queryByText("Crear evento")).toBeNull();
  });

  it("shows the empty text when nothing matches", async () => {
    render(
      <CommandPalette open onOpenChange={vi.fn()} items={items()} emptyText="Sin coincidencias" />,
    );
    await userEvent.type(screen.getByRole("combobox"), "zzzzz");
    expect(screen.getByText("Sin coincidencias")).toBeInTheDocument();
  });

  it("calls onSelect then closes when an item is chosen", async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} items={items([{ onSelect }])} />);
    await userEvent.click(screen.getByText("Inicio"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
