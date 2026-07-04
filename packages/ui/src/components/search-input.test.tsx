// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SearchInput } from "./search-input";

afterEach(cleanup);

describe("SearchInput", () => {
  it("renders a type=search input labelled by an sr-only label", () => {
    render(<SearchInput label="Buscar miembros" placeholder="Buscar…" />);
    const input = screen.getByLabelText("Buscar miembros");
    expect(input).toBeTruthy();
    expect(input.getAttribute("type")).toBe("search");
    expect(input.getAttribute("placeholder")).toBe("Buscar…");
  });

  it("honors a caller-provided id for the label linkage", () => {
    render(<SearchInput label="Buscar" id="my-search" />);
    const input = screen.getByLabelText("Buscar");
    expect(input.id).toBe("my-search");
  });

  it("pins type=search even if rest props try to override", () => {
    render(<SearchInput label="Buscar" {...({ type: "text" } as object)} />);
    expect(screen.getByLabelText("Buscar").getAttribute("type")).toBe("search");
  });

  it("md default is h-11/pl-11 and sm is h-10/pl-9", () => {
    render(
      <>
        <SearchInput label="md" />
        <SearchInput label="sm" size="sm" />
      </>,
    );
    expect(screen.getByLabelText("md").className).toContain("h-11");
    expect(screen.getByLabelText("md").className).toContain("pl-11");
    expect(screen.getByLabelText("sm").className).toContain("h-10");
    expect(screen.getByLabelText("sm").className).toContain("pl-9");
  });

  it("suppresses the native search cancel button", () => {
    render(<SearchInput label="Buscar" />);
    expect(screen.getByLabelText("Buscar").className).toContain("search-cancel-button");
  });

  it("wrapper className lands on the relative wrapper, not the input", () => {
    render(<SearchInput label="Buscar" className="max-w-[260px]" />);
    const input = screen.getByLabelText("Buscar");
    expect(input.className).not.toContain("max-w-[260px]");
    expect(input.closest("div")?.className).toContain("max-w-[260px]");
  });
});
