import { uniqueRemedies, type Remedy } from "../remedy.ts";

/** One line of a `brand:setup` or `brand:doctor` table. */
export interface CheckRow {
  check: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
  remedies?: readonly Remedy[];
}

const row =
  (status: CheckRow["status"]) =>
  (check: string, detail: string, remedies?: readonly Remedy[]): CheckRow => ({
    check,
    status,
    detail,
    remedies,
  });

export const ok = row("ok");
export const warn = row("warn");
export const fail = row("fail");
export const skip = row("skip");

/** The remedies of failing and warning rows, each once, in row (fix) order. */
export const rowRemedies = (rows: readonly CheckRow[]): Remedy[] =>
  uniqueRemedies(
    rows
      .filter(({ status }) => status === "fail" || status === "warn")
      .flatMap(({ remedies }) => remedies ?? []),
  );
