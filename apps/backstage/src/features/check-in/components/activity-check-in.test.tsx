import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import type { Member } from "@luminova/types";

let scanHandler: ((text: string) => void) | undefined;
vi.mock("@luminova/ui/qr-scanner", () => ({
  QrScanner: (props: { onScan: (text: string) => void }) => {
    scanHandler = props.onScan;
    return <div data-testid="qr" />;
  },
}));
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
vi.mock("../hooks/use-remove-check-in", () => ({
  useRemoveCheckIn: () => ({ mutate: () => {}, isPending: false }),
}));

import { ActivityCheckIn } from "./activity-check-in";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import type { ReactNode } from "react";

const members = [{ id: "m-1", name: "Ana Rivas" }] as Member[];

function renderCheckIn(ui: ReactNode) {
  return render(
    <AbilityProvider claims={{ roles: ["Admin"], perms: ["manage:all"] }} uid="admin">
      {ui}
    </AbilityProvider>,
  );
}

beforeEach(() => {
  mutate = () => {};
  scanHandler = undefined;
});

function tapMemberByName(name: RegExp) {
  fireEvent.change(screen.getByLabelText(/buscar miembro/i), { target: { value: "ana" } });
  fireEvent.click(screen.getByRole("button", { name }));
}

async function openScanner() {
  fireEvent.click(screen.getByRole("button", { name: /escanear carnets/i }));
  await screen.findByTestId("qr");
  if (!scanHandler) throw new Error("scanner not mounted");
  return scanHandler;
}

describe("ActivityCheckIn", () => {
  it("shows a success toast after a check-in succeeds", async () => {
    mutate = (_input, opts) => opts.onSuccess?.();
    renderCheckIn(<ActivityCheckIn activityId="a1" members={members} />);
    tapMemberByName(/ana rivas/i);
    expect(await screen.findByText("Asistencia registrada")).toBeInTheDocument();
  });

  it("shows an error toast when the check-in write fails", async () => {
    mutate = (_input, opts) => opts.onError?.();
    renderCheckIn(<ActivityCheckIn activityId="a1" members={members} />);
    tapMemberByName(/ana rivas/i);
    expect(await screen.findByText("No se pudo registrar la asistencia")).toBeInTheDocument();
  });

  it("shows a success overlay on QR scan and dismisses it on tap (one read)", async () => {
    mutate = (_input, opts) => opts.onSuccess?.();
    renderCheckIn(<ActivityCheckIn activityId="a1" members={members} />);
    const scan = await openScanner();
    act(() => scan("jcioriente:member:m-1"));
    const overlay = await screen.findByRole("button", { name: /continuar escaneando/i });
    expect(within(overlay).getByText("Asistencia registrada")).toBeInTheDocument();
    expect(within(overlay).getByText("Ana Rivas")).toBeInTheDocument();
    fireEvent.click(overlay);
    expect(screen.queryByText("Asistencia registrada")).not.toBeInTheDocument();
  });

  it("ignores further scans while a result overlay is shown", async () => {
    const calls: unknown[] = [];
    mutate = (input, opts) => {
      calls.push(input);
      opts.onSuccess?.();
    };
    renderCheckIn(<ActivityCheckIn activityId="a1" members={members} />);
    await openScanner();
    // Call the latest handler each time, as the real scanner does via its ref.
    act(() => scanHandler!("jcioriente:member:m-1"));
    act(() => scanHandler!("jcioriente:member:m-1"));
    expect(calls).toHaveLength(1);
  });

  it("shows an error overlay for an unrecognized QR payload", async () => {
    renderCheckIn(<ActivityCheckIn activityId="a1" members={members} />);
    const scan = await openScanner();
    act(() => scan("not-our-qr"));
    expect(await screen.findByText("Código no reconocido")).toBeInTheDocument();
  });

  it("shows a closed-window notice and hides the tap UI when the window is closed", () => {
    renderCheckIn(<ActivityCheckIn activityId="a1" members={members} open={false} />);
    expect(screen.getByText(/check-in no disponible/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ana rivas/i })).not.toBeInTheDocument();
  });
});
