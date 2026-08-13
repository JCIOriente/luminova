import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked SDK, not the emulator: no repository in this app is emulator-tested, and the
// three assertions that matter (no `where`, both lifecycle fields written together) are
// about the CALL the repository issues, not about Firestore's response.
// vi.hoisted, not bare consts: the vi.mock factory is hoisted above them, so a top-level
// `const getDocs = vi.fn()` is still uninitialized when the factory runs.
const sdk = vi.hoisted(() => ({
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(async () => ({ id: "new-id" })),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  doc: vi.fn((coll: { path: string }, id: string) => ({ path: `${coll.path}/${id}` })),
  query: vi.fn(),
  where: vi.fn(),
}));
const { getDocs, updateDoc, query, where } = sdk;

vi.mock("@luminova/firebase/db", () => ({ getDb: () => ({ mock: "db" }) }));
vi.mock("firebase/firestore", () => sdk);

import { RoleRepository } from "./role-repository";

// Timestamp-LIKE, not a bare {seconds, nanoseconds}: this fixture goes through
// parseDocs + roleDefinitionDocSchema, whose clientTimestampSchema checks for `toMillis`
// and `toDate`. A structural stand-in without them is rejected and the doc silently
// disappears from the result.
const DELETED_AT = { toMillis: () => 1, toDate: () => new Date(1) };

const snap = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  ref: { parent: { id: "roles" } },
  data: () => ({
    name: id,
    description: "",
    builtIn: false,
    builtInKey: null,
    permissions: [],
    locked: false,
    active: true,
    deletedAt: null,
    ...over,
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  getDocs.mockResolvedValue({ docs: [] });
});

describe("RoleRepository.getAll", () => {
  it("BLOCKING: reads the whole collection — no active filter", async () => {
    // /permisos must be able to SHOW and RESTORE a deactivated role. Filtering here made
    // it invisible to the only UI that could bring it back.
    await new RoleRepository().getAll();
    expect(getDocs).toHaveBeenCalledWith({ path: "roles" });
    expect(where).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("returns deactivated docs, built-ins first then alphabetical", async () => {
    getDocs.mockResolvedValue({
      docs: [
        // `deletedAt` too: roleLifecycleSafe() requires `deletedAt is timestamp` whenever
        // active is false, so this is the only inactive shape the collection can hold.
        snap("c_dead", { name: "Auditoría", active: false, deletedAt: DELETED_AT }),
        snap("Treasury", { name: "Tesorería", builtIn: true, builtInKey: "Treasury" }),
      ],
    });
    const roles = await new RoleRepository().getAll();
    expect(roles.map((r) => r.id)).toEqual(["Treasury", "c_dead"]);
    expect(roles.find((r) => r.id === "c_dead")?.active).toBe(false);
  });
});

describe("RoleRepository lifecycle writes", () => {
  it("softDelete stamps active:false + a server deletedAt", async () => {
    await new RoleRepository().softDelete("c1");
    expect(updateDoc).toHaveBeenCalledWith(
      { path: "roles/c1" },
      { active: false, deletedAt: "SERVER_TS" },
    );
  });

  it("BLOCKING: reactivate writes BOTH lifecycle fields", async () => {
    // firestore.rules' roleLifecycleSafe() couples them (active:true requires
    // deletedAt == null) and beacon's isActiveRoleDoc reads both, so clearing only
    // `active` leaves a doc live to getAll()'s sort and dead to the perms pipeline.
    await new RoleRepository().reactivate("c_dead");
    expect(updateDoc).toHaveBeenCalledWith(
      { path: "roles/c_dead" },
      { active: true, deletedAt: null },
    );
  });
});
