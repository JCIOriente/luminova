import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { filterMembers, statusCounts } from "./member-filter";

function member(p: Partial<Member>): Member {
  return {
    id: "1",
    name: "Ana Gómez",
    email: "ana@jci.bo",
    role: "Tesorera",
    joinDate: Timestamp.fromDate(new Date("2021-01-01T00:00:00Z")),
    birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
    ...p,
  };
}

describe("filterMembers", () => {
  const rows = [
    member({ id: "1", name: "Ana Gómez", email: "ana@jci.bo", role: "Tesorera", status: "Activo" }),
    member({
      id: "2",
      name: "Beto Ruiz",
      email: "beto@jci.bo",
      role: "Presidente",
      status: "Inactivo",
    }),
    member({ id: "3", name: "Cy Paz", email: "cy@otra.bo", role: "Vocal", status: "Desafiliado" }),
  ];

  it("returns all with empty search and Todos", () => {
    expect(filterMembers(rows, { search: "", status: "Todos" })).toHaveLength(3);
  });
  it("matches name/email/role case-insensitively", () => {
    expect(filterMembers(rows, { search: "PRESI", status: "Todos" }).map((m) => m.id)).toEqual([
      "2",
    ]);
    expect(filterMembers(rows, { search: "otra.bo", status: "Todos" }).map((m) => m.id)).toEqual([
      "3",
    ]);
  });
  it("filters by status", () => {
    expect(filterMembers(rows, { search: "", status: "Activo" }).map((m) => m.id)).toEqual(["1"]);
  });
  it("ANDs search and status", () => {
    expect(filterMembers(rows, { search: "ruiz", status: "Activo" })).toHaveLength(0);
  });
});

describe("statusCounts", () => {
  it("counts each status plus total", () => {
    const rows = [
      member({ status: "Activo" }),
      member({ status: "Activo" }),
      member({ status: "Inactivo" }),
    ];
    expect(statusCounts(rows)).toEqual({ Todos: 3, Activo: 2, Inactivo: 1, Desafiliado: 0 });
  });
});
