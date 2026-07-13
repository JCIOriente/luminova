// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Menu, MenuItem } from "./menu";

afterEach(cleanup);

describe("Button", () => {
  it("forwards a ref to the underlying <button>", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button as="button" ref={ref}>
        Guardar
      </Button>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("spreads arbitrary DOM/event props a Radix trigger injects (onPointerDown, aria-expanded)", async () => {
    const onPointerDown = vi.fn();
    render(
      <Button as="button" onPointerDown={onPointerDown} aria-expanded={false} data-state="closed">
        Menú
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Menú" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("data-state")).toBe("closed");
    await userEvent.pointer({ keys: "[MouseLeft]", target: button });
    expect(onPointerDown).toHaveBeenCalled();
  });

  it("opens a Menu when used as its asChild trigger (regression: dead 'Nuevo' button)", async () => {
    const onSelect = vi.fn();
    render(
      <Menu
        trigger={
          <Button as="button" type="button">
            Nuevo
          </Button>
        }
      >
        <MenuItem onSelect={onSelect}>Nuevo proyecto</MenuItem>
      </Menu>,
    );
    expect(screen.queryByText("Nuevo proyecto")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(await screen.findByText("Nuevo proyecto")).toBeTruthy();
  });
});
