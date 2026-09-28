// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneInput } from "./phone-input";

afterEach(cleanup);

const fourDigits = (raw: string) => raw.replace(/\D/g, "").slice(0, 4);

function Controlled() {
  const [value, setValue] = useState("");
  return (
    <PhoneInput
      aria-label="Tel"
      sanitize={fourDigits}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

describe("PhoneInput", () => {
  it("renders a tel control with the tel keypad", () => {
    render(<PhoneInput aria-label="Tel" sanitize={fourDigits} />);
    const input = screen.getByLabelText("Tel");
    expect(input.getAttribute("type")).toBe("tel");
    expect(input.getAttribute("inputmode")).toBe("tel");
  });

  it("caps typed input via sanitize, uncontrolled, and hands the capped value to onChange", async () => {
    const onChange = vi.fn((e: { target: { value: string } }) => e.target.value);
    render(<PhoneInput aria-label="Tel" sanitize={fourDigits} onChange={onChange} />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.type(input, "12a34567");
    expect(input.value).toBe("1234");
    expect(onChange).toHaveLastReturnedWith("1234");
  });

  it("caps pasted input, controlled", async () => {
    render(<Controlled />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.click(input);
    await userEvent.paste("+9 87 654 321");
    expect(input.value).toBe("9876");
  });
});
