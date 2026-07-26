// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";

afterEach(cleanup);

describe("Checkbox", () => {
  it("toggles via the label and reports the next checked state", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Consentir" />);
    fireEvent.click(screen.getByLabelText("Consentir"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("keeps the label `relative` so the sr-only input can't decouple and scroll-jump", () => {
    // jsdom can't assert layout, so guard the CSS contract directly: the sr-only
    // (position:absolute) input MUST be contained by a positioned label, else it
    // detaches from a nested scroll container and the page jumps on focus.
    render(<Checkbox checked={false} onChange={() => {}} label="Consentir" />);
    const input = screen.getByLabelText("Consentir");
    expect(input.className).toContain("sr-only");
    expect(input.closest("label")?.className).toContain("relative");
  });
});
