import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Member } from "@luminova/types";

vi.mock("@luminova/ui/qr-scanner", () => ({ QrScanner: () => <div data-testid="qr" /> }));
vi.mock("../hooks/use-activity-check-ins", () => ({
  useActivityCheckIns: () => ({ data: [] }),
}));

type MutateOpts = { onSuccess?: () => void; onError?: () => void };
let mutate: (input: unknown, opts: MutateOpts) => void;
vi.mock("../hooks/use-create-check-in", () => ({
  useCreateCheckIn: () => ({
    mutate: (input: unknown, opts: MutateOpts) => mutate(input, opts),
    isPending: false,
  }),
}));

import { ActivityCheckIn } from "./activity-check-in";

const members = [{ id: "m-1", name: "Ana Rivas" }] as Member[];

beforeEach(() => {
  mutate = () => {};
});

describe("ActivityCheckIn", () => {
  it("shows a success toast after a check-in succeeds", async () => {
    mutate = (_input, opts) => opts.onSuccess?.();
    render(<ActivityCheckIn activityId="a1" members={members} />);
    fireEvent.click(screen.getByRole("button", { name: /ana rivas/i }));
    expect(await screen.findByText("Asistencia registrada")).toBeInTheDocument();
  });

  it("shows an error toast when the check-in write fails", async () => {
    mutate = (_input, opts) => opts.onError?.();
    render(<ActivityCheckIn activityId="a1" members={members} />);
    fireEvent.click(screen.getByRole("button", { name: /ana rivas/i }));
    expect(await screen.findByText("No se pudo registrar la asistencia")).toBeInTheDocument();
  });

  it("shows a closed-window notice and hides the tap UI when the window is closed", () => {
    render(<ActivityCheckIn activityId="a1" members={members} open={false} />);
    expect(screen.getByText(/check-in no disponible/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ana rivas/i })).not.toBeInTheDocument();
  });
});
