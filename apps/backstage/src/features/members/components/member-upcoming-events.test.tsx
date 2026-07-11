import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import type { Activity } from "@luminova/types";
import { MemberUpcomingEvents } from "./member-upcoming-events";

const now = new Date("2026-07-05T16:00:00Z");

function activity(id: string, title: string, startIso: string, location: string | null): Activity {
  return {
    id,
    title,
    location,
    status: "Programada",
    startAt: Timestamp.fromDate(new Date(startIso)),
  } as unknown as Activity;
}

const base = {
  isLoading: false,
  isError: false,
  error: null,
  onRetry: vi.fn(),
  now,
};

describe("MemberUpcomingEvents", () => {
  it("lists upcoming activities soonest-first", () => {
    render(
      <MemberUpcomingEvents
        {...base}
        activities={[
          activity("a", "Asamblea", "2026-07-20T19:00:00Z", "Sede JCI"),
          activity("b", "Taller", "2026-07-10T09:00:00Z", null),
        ]}
      />,
    );
    const titles = screen.getAllByText(/Asamblea|Taller/).map((n) => n.textContent);
    expect(titles).toEqual(["Taller", "Asamblea"]);
    expect(screen.getByText("Sede JCI")).toBeInTheDocument();
    expect(screen.getByText("Sin ubicación")).toBeInTheDocument();
  });

  it("shows an empty state, not an error, when there are none", () => {
    render(<MemberUpcomingEvents {...base} activities={[]} />);
    expect(screen.getByText("No hay eventos próximos.")).toBeInTheDocument();
  });

  it("shows an error state distinct from empty on failure", () => {
    render(
      <MemberUpcomingEvents {...base} isError error={new Error("boom")} activities={undefined} />,
    );
    expect(screen.getByText("No se pudo cargar")).toBeInTheDocument();
    expect(screen.queryByText("No hay eventos próximos.")).not.toBeInTheDocument();
  });
});
