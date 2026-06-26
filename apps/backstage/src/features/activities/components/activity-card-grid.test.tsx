import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import type { Activity } from "@luminova/types";
import { ActivityCardGrid } from "./activity-card-grid";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ params, children, ...rest }: { params?: { id: string }; children: React.ReactNode }) => (
    <a href={`/activities/${params?.id}`} {...rest}>
      {children}
    </a>
  ),
}));

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    termId: "2026",
    title: "Jornada Eco",
    description: null,
    location: null,
    category: "ProjectExecution",
    parentType: "Project",
    parentId: "p1",
    organizers: { directorId: "d1", coDirectorIds: [] },
    startAt: Timestamp.fromDate(new Date("2026-06-13T20:00:00Z")),
    endAt: null,
    photos: [],
    status: "Programada",
    ...over,
  };
}

const noop = () => {};
const BASE = {
  parentTitleById: { p1: "Proyecto Reciclá" },
  checkInOpenById: { a1: true },
  directorById: { d1: { name: "Ana Pérez", profilePicture: null } },
  canManage: false,
  onEdit: noop,
  onCancel: noop,
};

describe("ActivityCardGrid", () => {
  it("links the title to the detail, labels its parent, and shows the director", () => {
    render(<ActivityCardGrid activities={[activity()]} {...BASE} />);
    expect(screen.getByRole("link", { name: "Jornada Eco" })).toHaveAttribute(
      "href",
      "/activities/a1",
    );
    expect(screen.getByText("Proyecto Reciclá")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.queryByText("Check-in cerrado")).not.toBeInTheDocument();
  });

  it("annotates an out-of-window activity as closed", () => {
    render(
      <ActivityCardGrid
        activities={[activity({ parentId: null, parentType: null })]}
        {...BASE}
        parentTitleById={{}}
        checkInOpenById={{ a1: false }}
      />,
    );
    expect(screen.getByText("Check-in cerrado")).toBeInTheDocument();
  });

  it("renders a location when present", () => {
    render(
      <ActivityCardGrid activities={[activity({ location: "Sede JCI · Equipetrol" })]} {...BASE} />,
    );
    expect(screen.getByText("Sede JCI · Equipetrol")).toBeInTheDocument();
  });

  it("exposes per-card actions only when the user can manage", () => {
    const { rerender } = render(<ActivityCardGrid activities={[activity()]} {...BASE} />);
    expect(screen.queryByLabelText(/acciones para/i)).not.toBeInTheDocument();
    rerender(<ActivityCardGrid activities={[activity()]} {...BASE} canManage />);
    expect(screen.getByLabelText("Acciones para Jornada Eco")).toBeInTheDocument();
  });

  it("shows an empty state when the filter yields nothing", () => {
    render(<ActivityCardGrid activities={[]} {...BASE} />);
    expect(screen.getByText("No hay actividades en este filtro")).toBeInTheDocument();
  });
});
