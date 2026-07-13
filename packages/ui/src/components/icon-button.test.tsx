// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconButton } from "./icon-button";
import { Menu, MenuItem } from "./menu";

afterEach(cleanup);

describe("IconButton", () => {
  it("forwards a ref to the underlying <button>", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <IconButton as="button" aria-label="Acciones" ref={ref}>
        <svg />
      </IconButton>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("opens a Menu when used as its asChild trigger", async () => {
    const onSelect = vi.fn();
    render(
      <Menu
        trigger={
          <IconButton as="button" aria-label="Acciones">
            <svg />
          </IconButton>
        }
      >
        <MenuItem onSelect={onSelect}>Editar</MenuItem>
      </Menu>,
    );
    expect(screen.queryByText("Editar")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Acciones" }));
    expect(await screen.findByText("Editar")).toBeTruthy();
  });
});
