// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("PhoneInput overflow and caret: regression cases", () => {
  it("accepts typing into a legacy stored value that carries a separator", async () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="346-7890" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.type(input, "1");
    expect(input.value).toBe("34678901");
  });

  it("does not restore a stale value after a same-length reset while focused", async () => {
    let setValue: (v: string) => void = () => {};
    function Resettable() {
      const [value, set] = useState("70012345");
      setValue = set;
      return (
        <PhoneInput
          aria-label="Tel"
          sanitize={eightDigits}
          value={value}
          onChange={(e) => set(e.target.value)}
        />
      );
    }
    render(<Resettable />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.click(input);
    act(() => setValue("60012345"));
    await userEvent.type(input, "9");
    expect(input.value).toBe("60012345");
  });

  it("puts the caret back at 0 after pasting a +591 prefix at the start", async () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="7001234" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.click(input);
    input.setSelectionRange(0, 0);
    await userEvent.paste("+591");
    expect(input.value).toBe("7001234");
    expect(input.selectionStart).toBe(0);
  });

  it("keeps the first pasted digit up to the cap when replacing a selection, like maxLength", async () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="70012345" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.click(input);
    input.setSelectionRange(7, 8);
    await userEvent.paste("67");
    expect(input.value).toBe("70012346");
  });

  it("replaces the whole value when everything is selected and a digit is typed", async () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="70012345" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.type(input, "6", { initialSelectionStart: 0, initialSelectionEnd: 8 });
    expect(input.value).toBe("6");
  });

  it("deletes with backspace in a full field", async () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="70012345" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.type(input, "{Backspace}");
    expect(input.value).toBe("7001234");
  });
});

// Sets the value the way a browser's own editing does, so React's value tracker sees a change.
function setNativeValue(input: HTMLInputElement, value: string, caret: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.setSelectionRange(caret, caret);
}

describe("PhoneInput: input that beforeinput cannot cancel", () => {
  it("restores the field when a composed digit overflows a full field", () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="70012345" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    input.focus();
    input.setSelectionRange(3, 3);
    fireEvent(
      input,
      new InputEvent("beforeinput", {
        inputType: "insertCompositionText",
        data: "9",
        bubbles: true,
        cancelable: false,
      }),
    );
    setNativeValue(input, "700912345", 4);
    fireEvent.input(input);
    expect(input.value).toBe("70012345");
    expect(input.selectionStart).toBe(3);
  });

  it("sanitizes and truncates an input that arrives with no beforeinput (documented fallback)", () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="70012345" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    input.focus();
    setNativeValue(input, "700912345", 4);
    fireEvent.input(input);
    expect(input.value).toBe("70091234");
  });
});

describe("PhoneInput: non-digit over a selection", () => {
  it("cancels a typed non-digit instead of deleting the selection", async () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="70012345" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.type(input, "a", { initialSelectionStart: 2, initialSelectionEnd: 5 });
    expect(input.value).toBe("70012345");
  });
});

describe("PhoneInput: forwarded ref", () => {
  it("keeps a stable callback ref attached across re-renders", () => {
    const ref = vi.fn();
    const { rerender } = render(<PhoneInput aria-label="Tel" sanitize={eightDigits} ref={ref} />);
    rerender(<PhoneInput aria-label="Tel" sanitize={eightDigits} ref={ref} placeholder="x" />);
    expect(ref).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLInputElement);
  });

  it("runs a React 19 ref cleanup on unmount instead of calling the ref with null", () => {
    const cleanupRef = vi.fn();
    const ref = vi.fn(() => cleanupRef);
    const { unmount } = render(<PhoneInput aria-label="Tel" sanitize={eightDigits} ref={ref} />);
    unmount();
    expect(cleanupRef).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenCalledTimes(1);
  });
});

describe("PhoneInput: caret edge cases", () => {
  it("clamps the caret at 0 when a typed 5 completes a 591 prefix at the start", async () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="91700123" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    await userEvent.type(input, "5", { initialSelectionStart: 0, initialSelectionEnd: 0 });
    expect(input.value).toBe("700123");
    expect(input.selectionStart).toBe(0);
  });

  it("does not move the selection of a field that is not focused", () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="7001" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    const setSelection = vi.spyOn(input, "setSelectionRange");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "70a01");
    fireEvent.input(input);
    expect(input.value).toBe("7001");
    expect(setSelection).not.toHaveBeenCalled();
  });
});

// One composition update the way Chromium delivers it: the composed range is selected, then
// beforeinput (not cancellable) carries the whole composition string, then the value changes.
function composeUpdate(input: HTMLInputElement, text: string, from: number, to: number) {
  input.setSelectionRange(from, to);
  fireEvent(
    input,
    new InputEvent("beforeinput", {
      inputType: "insertCompositionText",
      data: text,
      bubbles: true,
      cancelable: false,
    }),
  );
  const next = input.value.slice(0, from) + text + input.value.slice(to);
  setNativeValue(input, next, from + text.length);
  fireEvent.input(input);
}

describe("PhoneInput: multi-update composition (Chromium)", () => {
  it("never lets a later composition update push a digit off the end", () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="7001234" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    input.focus();
    composeUpdate(input, "9", 3, 3);
    expect(input.value).toBe("70091234");
    composeUpdate(input, "98", 3, 4);
    expect(input.value).toBe("70091234");
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(4);
  });

  it("keeps a multi-update composition that fits", () => {
    render(<PhoneInput aria-label="Tel" sanitize={eightDigits} defaultValue="7001" />);
    const input = screen.getByLabelText<HTMLInputElement>("Tel");
    input.focus();
    composeUpdate(input, "9", 2, 2);
    expect(input.value).toBe("70901");
    composeUpdate(input, "98", 2, 3);
    expect(input.value).toBe("709801");
  });
});
