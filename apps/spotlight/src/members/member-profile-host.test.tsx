import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { MemberShowcaseItem } from "@luminova/types/engine";
import { MemberLink } from "./member-link";
import { MemberProfileHost } from "./member-profile-host";
import { validateMemberSearch } from "./member-search";
import { fetchMember } from "./member-showcase-firestore";

vi.mock("./member-showcase-firestore", () => ({ fetchMember: vi.fn() }));
const fetchMock = vi.mocked(fetchMember);

const member: MemberShowcaseItem = {
  id: "m1",
  name: "Ana Rojas",
  portraitUrl: null,
  profession: null,
  joinYear: null,
  bio: null,
  linkedinUrl: null,
  isPastPresident: false,
  career: [],
  projects: [],
};

function start(entry: string) {
  const rootRoute = createRootRoute({
    validateSearch: validateMemberSearch,
    component: () => (
      <>
        <Outlet />
        <MemberProfileHost />
      </>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <MemberLink memberId="m1" name="Ana Rojas">
        Ana Rojas
      </MemberLink>
    ),
  });
  const history = createMemoryHistory({ initialEntries: [entry] });
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]), history });
  render(<RouterProvider router={router} />);
  return history;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(member);
});

describe("MemberProfileHost", () => {
  it("opens from a link and closes back to the entry it came from", async () => {
    const history = start("/");
    fireEvent.click(await screen.findByRole("link", { name: "Ver perfil de Ana Rojas" }));
    expect(await screen.findByRole("heading", { name: "Ana Rojas" })).toBeInTheDocument();
    const opened = history.length;

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Cerrar" }));
    });

    await waitFor(() => expect(history.location.search).toBe(""));
    expect(history.location.state.__TSR_index).toBe(0);
    expect(history.length).toBe(opened);
  });

  it("drops the param in place when it opened from a shared link", async () => {
    const history = start("/?miembro=m1");
    expect(await screen.findByRole("heading", { name: "Ana Rojas" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Cerrar" }));
    });

    await waitFor(() => expect(history.location.search).toBe(""));
    expect(history.length).toBe(1);
  });

  it.each(["a%2Fb", "..%2F..", "123%20or%201"])("never reads an invalid id: %s", async (id) => {
    start(`/?miembro=${id}`);
    await screen.findByRole("link", { name: "Ver perfil de Ana Rojas" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
