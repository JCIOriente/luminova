import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import type { Activity } from "@luminova/types";
import { ActivityTable } from "./activity-table";

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
    category: "ProjectExecution",
    parentType: "Project",
    parentId: "p1",
    organizers: { directorId: "d1", coDirectorIds: [] },
    startAt: Timestamp.fromDate(new Date("2026-06-13T20:00:00Z")),
    endAt: null,
    photos: [],
    status: "Programada",
    ...over,
  } as Activity;
}

const noop = () => {};

describe("ActivityTable", () => {
  it("links the title to the activity detail and labels its parent", () => {
    render(
      <ActivityTable
        activities={[activity()]}
        onEdit={noop}
        onCancel={noop}
        canManage={false}
        parentTitleById={{ p1: "Proyecto Reciclá" }}
        checkInOpenById={{ a1: true }}
      />,
    );
    const link = screen.getByRole("link", { name: "Jornada Eco" });
    expect(link).toHaveAttribute("href", "/activities/a1");
    expect(screen.getByText("Proyecto Reciclá")).toBeInTheDocument();
    expect(screen.queryByText("Check-in cerrado")).not.toBeInTheDocument();
  });

  it("annotates an out-of-window activity as closed", () => {
    render(
      <ActivityTable
        activities={[activity({ parentId: null, parentType: null })]}
        onEdit={noop}
        onCancel={noop}
        canManage={false}
        parentTitleById={{}}
        checkInOpenById={{ a1: false }}
      />,
    );
    expect(screen.getByText("Check-in cerrado")).toBeInTheDocument();
  });
});
