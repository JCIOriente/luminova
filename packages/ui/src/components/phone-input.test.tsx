// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneInput } from "./phone-input";

afterEach(cleanup);

const fourDigits = (raw: string) => raw.replace(/\D/g, "").slice(0, 4);
// A minimal 8-digit sanitizer with a 591 prefix, enough to drive the caret paths. The real
// prefix rules are tested in @luminova/types; ui takes no dependency on that package.
const eightDigits = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  const national = digits.length > 8 && digits.startsWith("591") ? digits.slice(3) : digits;
  return national.slice(0, 8);
};

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

describe("PhoneInput caret", () => {
  function setup() {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} />);
    return screen.getByLabelText<HTMLInputElement>("Tel");
  }

  it("rejects a digit inserted mid-string into a full field, keeping value and caret", async () => {
    const input = setup();
    await userEvent.type(input, "70012345");
    await userEvent.type(input, "9", { initialSelectionStart: 3, initialSelectionEnd: 3 });
    expect(input.value).toBe("70012345");
    expect(input.selectionStart).toBe(3);
  });

  it("keeps the caret in place when a non-digit typed mid-string is stripped", async () => {
    const input = setup();
    await userEvent.type(input, "7001");
    await userEvent.type(input, "a", { initialSelectionStart: 2, initialSelectionEnd: 2 });
    expect(input.value).toBe("7001");
    expect(input.selectionStart).toBe(2);
  });

  it("keeps a mid-string digit insertion when the field has room", async () => {
    const input = setup();
    await userEvent.type(input, "7001");
    await userEvent.type(input, "9", { initialSelectionStart: 2, initialSelectionEnd: 2 });
    expect(input.value).toBe("70901");
    expect(input.selectionStart).toBe(3);
  });

  it("still lets a typed +591 prefix collapse once the ninth digit arrives", async () => {
    const input = setup();
    await userEvent.type(input, "+59170012345");
    expect(input.value).toBe("70012345");
  });

  it("still truncates an over-long paste", async () => {
    const input = setup();
    await userEvent.click(input);
    await userEvent.paste("7001234567890");
    expect(input.value).toBe("70012345");
  });
});
