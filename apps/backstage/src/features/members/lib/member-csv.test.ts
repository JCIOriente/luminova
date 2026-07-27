import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { membersToCsv } from "./member-csv";

const base: Member = {
  id: "1",
  name: "Ana Gómez",
  email: "ana@jci.bo",
  joinDate: Timestamp.fromDate(new Date("2021-01-01T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
  status: "Activo",
  profilePicture: null,
  totalPoints: 12,
  active: true,
  deletedAt: null,
};

describe("membersToCsv", () => {
  it("emits a header and one row per member", () => {
    const roleLabel = () => "Tesorera";
    const csv = membersToCsv([base], roleLabel);
    expect(csv.split("\n")[0]).toBe("Nombre,Correo,Cargo,Estado,Desde,Puntos");
    expect(csv.split("\n")[1]).toBe("Ana Gómez,ana@jci.bo,Tesorera,Activo,2021,12");
  });
  it("quotes fields containing commas or quotes", () => {
    const roleLabel = () => 'Director, "Área"';
    const csv = membersToCsv([base], roleLabel);
    expect(csv.split("\n")[1]).toContain('"Director, ""Área"""');
  });

  // Escaped at the output boundary, not in the validators: memberNameValid() cannot cover a
  // name stored before it existed, and Correo/Cargo carry no such pattern at all.
  it.each(['=HYPERLINK("http://evil")', "+1+1", "-1+1", "@SUM(A1)"])(
    "neutralizes the formula prefix in %j",
    (formula) => {
      const csv = membersToCsv([{ ...base, name: formula }], () => "Tesorera");
      expect(csv.split("\n")[1]).toContain(`"'${formula.replace(/"/g, '""')}"`);
    },
  );

  it("neutralizes a formula in an admin-authored cargo title", () => {
    const csv = membersToCsv([base], () => "=cmd|'/C calc'!A1");
    expect(csv.split("\n")[1]).toContain(`"'=cmd|'/C calc'!A1"`);
  });
});
