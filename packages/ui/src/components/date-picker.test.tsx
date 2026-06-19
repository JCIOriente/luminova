import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker, DateTimePicker } from "./date-picker";

function DateHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DatePicker id="d" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

function DateTimeHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTimePicker id="dt" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

async function pickViaDropdown(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`invalid iso date: ${iso}`);
  }
  const dialog = screen.getByRole("dialog", { name: "Calendario" });
  const [monthSelect, yearSelect] = within(dialog).getAllByRole("combobox");
  if (!monthSelect || !yearSelect) throw new Error("calendar dropdowns not found");
  await userEvent.selectOptions(monthSelect, String(month - 1));
  await userEvent.selectOptions(yearSelect, String(year));
  const cell = within(dialog)
    .getAllByRole("gridcell")
    .find((c) => c.textContent?.trim() === String(day));
  if (!cell) throw new Error(`day ${day} not found`);
  await userEvent.click(within(cell).getByRole("button"));
}

describe("DatePicker", () => {
  it("shows the placeholder when empty", () => {
    render(<DateHarness />);
    expect(screen.getByRole("button", { name: /seleccionar fecha/i })).toBeInTheDocument();
  });

  it("renders a preselected value as a Spanish label", () => {
    render(<DateHarness initial="1992-07-15" />);
    expect(screen.getByRole("button")).toHaveTextContent("15 de jul 1992");
  });

  it("emits a yyyy-MM-dd string when a day is chosen via the dropdown caption", async () => {
    render(<DateHarness />);
    await userEvent.click(screen.getByRole("button", { name: /seleccionar fecha/i }));
    await pickViaDropdown("1992-07-15");
    expect(screen.getByTestId("value")).toHaveTextContent("1992-07-15");
  });
});

describe("DateTimePicker", () => {
  it("keeps the time when the date changes and emits yyyy-MM-ddTHH:mm", async () => {
    render(<DateTimeHarness initial="2024-03-10T09:30" />);
    await userEvent.click(screen.getByRole("button"));
    await pickViaDropdown("2024-03-20");
    expect(screen.getByTestId("value")).toHaveTextContent("2024-03-20T09:30");
  });

  it("disables the time input until a date is selected", async () => {
    render(<DateTimeHarness />);
    await userEvent.click(screen.getByRole("button", { name: /seleccionar fecha y hora/i }));
    expect(screen.getByLabelText("Hora")).toBeDisabled();
  });
});
