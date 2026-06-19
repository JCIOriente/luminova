import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Drive a `@luminova/ui` DatePicker / DateTimePicker in tests: open the popover by
 * its field label, then pick the date through the month/year dropdown caption and
 * the day grid. `iso` is `yyyy-MM-dd`; the time portion of a DateTimePicker keeps
 * its existing value (defaulting to "now" on a first pick).
 */
export async function pickDate(fieldLabel: RegExp | string, iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`invalid iso date: ${iso}`);
  }
  await userEvent.click(screen.getByLabelText(fieldLabel));
  const dialog = screen.getByRole("dialog", { name: "Calendario" });
  const [monthSelect, yearSelect] = within(dialog).getAllByRole("combobox");
  if (!monthSelect || !yearSelect) throw new Error("calendar dropdowns not found");
  await userEvent.selectOptions(monthSelect, String(month - 1));
  await userEvent.selectOptions(yearSelect, String(year));
  const cell = within(dialog)
    .getAllByRole("gridcell")
    .find((c) => c.textContent?.trim() === String(day));
  if (!cell) throw new Error(`day ${day} not found in calendar`);
  await userEvent.click(within(cell).getByRole("button"));
}
