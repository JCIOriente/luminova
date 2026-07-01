import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManualTapList } from "./manual-tap-list";
import type { Member } from "@luminova/types";

const members = [
  { id: "m-1", name: "Ana Rivas" },
  { id: "m-2", name: "Bruno Paz" },
] as Member[];

function search(value: string) {
  fireEvent.change(screen.getByLabelText(/buscar miembro/i), { target: { value } });
}

describe("ManualTapList", () => {
  it("reveals no matches until the operator types", () => {
    render(<ManualTapList members={members} checkedInIds={[]} onTap={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /ana rivas/i })).not.toBeInTheDocument();
  });

  it("taps a matched member who hasn't checked in", () => {
    const onTap = vi.fn();
    render(<ManualTapList members={members} checkedInIds={["m-2"]} onTap={onTap} />);
    search("ana");
    fireEvent.click(screen.getByRole("button", { name: /ana rivas/i }));
    expect(onTap).toHaveBeenCalledWith("m-1");
  });

  it("disables an already-checked-in match", () => {
    render(<ManualTapList members={members} checkedInIds={["m-2"]} onTap={vi.fn()} />);
    search("bruno");
    expect(screen.getByRole("button", { name: /bruno paz/i })).toBeDisabled();
  });

  it("filters by the search term", () => {
    render(<ManualTapList members={members} checkedInIds={[]} onTap={vi.fn()} />);
    search("bruno");
    expect(screen.queryByRole("button", { name: /ana rivas/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bruno paz/i })).toBeInTheDocument();
  });
});
