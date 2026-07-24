import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { Timestamp } from "firebase/firestore";
import type { InboxDoc } from "@luminova/types";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@luminova/firebase", () => ({
  getFirebase: () => ({ auth: { currentUser: { uid: "u1" } } }),
}));

const list = vi.fn<() => Promise<InboxDoc[]>>();
const markRead = vi.fn(async () => undefined);
vi.mock("../repositories/inbox-repository", () => ({
  InboxRepository: class {
    list = list;
    markRead = markRead;
  },
}));

import { NotificationBell } from "./notification-bell";

function inbox(over: Partial<InboxDoc> = {}): InboxDoc {
  return {
    id: "n1",
    title: "Aviso",
    body: "Cuerpo del aviso",
    url: null,
    read: false,
    createdAt: Timestamp.fromDate(new Date("2024-01-01T00:00:00Z")),
    ...over,
  };
}

function renderBell(ui: ReactElement = <NotificationBell />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("NotificationBell", () => {
  beforeEach(() => {
    navigate.mockReset();
    list.mockReset();
    markRead.mockClear();
  });

  it("shows the unread count on the bell badge", async () => {
    list.mockResolvedValue([
      inbox({ id: "a", read: false }),
      inbox({ id: "b", read: false }),
      inbox({ id: "c", read: true }),
    ]);
    renderBell();
    expect(await screen.findByLabelText(/2 sin leer/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("hides the badge when nothing is unread", async () => {
    list.mockResolvedValue([inbox({ id: "a", read: true })]);
    renderBell();
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.getByLabelText("Notificaciones")).toBeInTheDocument();
    expect(screen.queryByLabelText(/sin leer/i)).not.toBeInTheDocument();
  });

  it("marks an item read and navigates to its in-app url on click", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue([inbox({ id: "n1", read: false, url: "/members" })]);
    renderBell();

    await user.click(await screen.findByLabelText(/2 sin leer|1 sin leer|Notificaciones/i));
    const item = await screen.findByRole("button", { name: /Aviso/i });
    await user.click(item);

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("n1"));
    expect(navigate).toHaveBeenCalledWith({ to: "/members" });
  });

  it("marks read and goes to the notifications page when the item has no url", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue([inbox({ id: "n2", read: false, url: null })]);
    renderBell();

    await user.click(await screen.findByLabelText(/sin leer|Notificaciones/i));
    await user.click(await screen.findByRole("button", { name: /Aviso/i }));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("n2"));
    expect(navigate).toHaveBeenCalledWith({ to: "/notificaciones" });
  });

  it("opens an absolute url in a new tab (does not replace the PWA)", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    list.mockResolvedValue([inbox({ id: "n3", read: false, url: "https://jci.org/evento" })]);
    renderBell();

    await user.click(await screen.findByLabelText(/sin leer|Notificaciones/i));
    await user.click(await screen.findByRole("button", { name: /Aviso/i }));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("n3"));
    expect(open).toHaveBeenCalledWith("https://jci.org/evento", "_blank", "noopener,noreferrer");
    expect(navigate).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("renders the empty state when the inbox is empty", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue([]);
    renderBell();

    await user.click(screen.getByLabelText("Notificaciones"));
    expect(await screen.findByText(/sin notificaciones/i)).toBeInTheDocument();
  });

  it("renders a loading state while the inbox is fetching", async () => {
    const user = userEvent.setup();
    list.mockReturnValue(new Promise<InboxDoc[]>(() => {}));
    renderBell();

    await user.click(screen.getByLabelText("Notificaciones"));
    expect(
      await screen.findByRole("status", { name: /cargando notificaciones/i }),
    ).toBeInTheDocument();
  });
});
