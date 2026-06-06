import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManualTapList } from "./manual-tap-list";
import type { Member } from "@luminova/types";

const members = [
  { id: "m-1", name: "Ana Rivas" },
  { id: "m-2", name: "Bruno Paz" },
] as Member[];

describe("ManualTapList", () => {
  it("taps a member who hasn't checked in", () => {
    const onTap = vi.fn();
    render(<ManualTapList members={members} checkedInIds={["m-2"]} onTap={onTap} />);
    fireEvent.click(screen.getByRole("button", { name: /ana rivas/i }));
    expect(onTap).toHaveBeenCalledWith("m-1");
  });

  it("disables an already-checked-in member", () => {
    const onTap = vi.fn();
    render(<ManualTapList members={members} checkedInIds={["m-2"]} onTap={onTap} />);
    expect(screen.getByRole("button", { name: /bruno paz/i })).toBeDisabled();
  });

  it("filters by the search term", () => {
    const onTap = vi.fn();
    render(<ManualTapList members={members} checkedInIds={[]} onTap={onTap} />);
    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: "bruno" } });
    expect(screen.queryByRole("button", { name: /ana rivas/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bruno paz/i })).toBeInTheDocument();
  });
});
