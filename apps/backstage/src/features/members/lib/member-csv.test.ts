import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { membersToCsv } from "./member-csv";

const base: Member = {
  id: "1",
  name: "Ana Gómez",
  email: "ana@jci.bo",
  role: "Tesorera",
  joinDate: Timestamp.fromDate(new Date("2021-01-01T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
  status: "Activo",
  profilePicture: null,
  totalPoints: 12,
  active: true,
  deletedAt: null,
};

const roleLabel = (m: Member) => m.role;

describe("membersToCsv", () => {
  it("emits a header and one row per member", () => {
    const csv = membersToCsv([base], roleLabel);
    expect(csv.split("\n")[0]).toBe("Nombre,Correo,Cargo,Estado,Desde,Puntos");
    expect(csv.split("\n")[1]).toBe("Ana Gómez,ana@jci.bo,Tesorera,Activo,2021,12");
  });
  it("quotes fields containing commas or quotes", () => {
    const csv = membersToCsv([{ ...base, role: 'Director, "Área"' }], roleLabel);
    expect(csv.split("\n")[1]).toContain('"Director, ""Área"""');
  });
});
