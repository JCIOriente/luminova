import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  toMemberCreateDoc,
  toMemberUpdateDoc,
  toSelfProfileDoc,
  dateInputValue,
} from "./member-mapper";
import type { MemberInput } from "@luminova/types";

const input: MemberInput = {
  name: "Ana Pérez",
  email: "ana@jci.bo",
  phone: "777",
  gender: "Femenino",
  profession: "Ingeniera",
  joinDate: "2020-03-15",
  birthdate: "1992-07-01",
  status: "Activo",
  cargoId: null,
  comisionIds: [],
};

describe("toMemberCreateDoc", () => {
  it("sets system defaults for a new member", () => {
    const doc = toMemberCreateDoc(input, "");
    expect(doc).toMatchObject({
      name: "Ana Pérez",
      email: "ana@jci.bo",
      phone: "777",
      gender: "Femenino",
      profession: "Ingeniera",
      status: "Activo",
      profilePicture: null,
      totalPoints: 0,
      active: true,
      deletedAt: null,
    });
  });

  it("omits publicProfile so the rules' create arm accepts the payload", () => {
    // Not a type-level tautology: toSelfProfileDoc DOES emit the key when it is defined,
    // and the create arm denies any create carrying it.
    expect(toMemberCreateDoc(input, "")).not.toHaveProperty("publicProfile");
  });

  it("converts date strings to Timestamps", () => {
    const doc = toMemberCreateDoc(input, "");
    expect(doc.joinDate).toBeInstanceOf(Timestamp);
    expect(dateInputValue(doc.joinDate)).toBe("2020-03-15");
    expect(dateInputValue(doc.birthdate)).toBe("1992-07-01");
  });

  it("stores empty string for omitted optional fields", () => {
    const doc = toMemberCreateDoc({ ...input, phone: undefined, profession: undefined }, "");
    expect(doc.phone).toBe("");
    expect(doc.profession).toBe("");
  });
});

describe("toSelfProfileDoc", () => {
  const self = {
    name: "Ana Pérez",
    phone: "777",
    profession: "Ingeniera",
    birthdate: "1992-07-01",
  };

  it("omits publicProfile when the member never decided (legacy doc)", () => {
    // The bug this guards: coercing absent to false here records an explicit opt-out on
    // an unrelated edit, and beacon then treats that member as already decided forever.
    expect(toSelfProfileDoc({ ...self, publicProfile: undefined })).not.toHaveProperty(
      "publicProfile",
    );
  });

  it("writes the decision the member actually made", () => {
    expect(toSelfProfileDoc({ ...self, publicProfile: false }).publicProfile).toBe(false);
    expect(toSelfProfileDoc({ ...self, publicProfile: true }).publicProfile).toBe(true);
  });
});

describe("toMemberUpdateDoc", () => {
  it("includes editable fields but not system fields", () => {
    const doc = toMemberUpdateDoc(input, "", null);
    expect(doc).toMatchObject({ name: "Ana Pérez", status: "Activo" });
    expect(doc).not.toHaveProperty("active");
    expect(doc).not.toHaveProperty("totalPoints");
    expect(doc).not.toHaveProperty("deletedAt");
    expect(doc).not.toHaveProperty("profilePicture");
  });
});

describe("dateInputValue", () => {
  it("formats a Timestamp as YYYY-MM-DD (UTC)", () => {
    const ts = Timestamp.fromDate(new Date("2001-12-09T00:00:00Z"));
    expect(dateInputValue(ts)).toBe("2001-12-09");
  });
});

const posInput: MemberInput = {
  name: "Ana Suárez",
  email: "ana@jci.org",
  phone: "",
  gender: "Femenino",
  profession: "",
  joinDate: "2024-03-01",
  birthdate: "1995-07-15",
  status: "Activo",
  cargoId: "pos-presidente",
  comisionIds: ["pos-etica"],
};

describe("member-mapper positions", () => {
  it("creates with current-term assignments", () => {
    const doc = toMemberCreateDoc(posInput, "uid-admin", "2026");
    expect(doc.positions).toEqual({
      "2026": { cargoId: "pos-presidente", comisionIds: ["pos-etica"], assignedBy: "uid-admin" },
    });
    expect(doc.gender).toBe("Femenino");
  });

  it("updates only the current term via dot path (other terms untouched)", () => {
    const doc = toMemberUpdateDoc(posInput, "uid-admin", null, "2026");
    expect(doc["positions.2026"]).toEqual({
      cargoId: "pos-presidente",
      comisionIds: ["pos-etica"],
      assignedBy: "uid-admin",
    });
    expect(doc).not.toHaveProperty("positions");
    expect(doc).not.toHaveProperty("role");
  });

  it("omits the positions slot when the assignment is unchanged (avoids re-gate)", () => {
    const doc = toMemberUpdateDoc(
      posInput,
      "uid-admin",
      { cargoId: "pos-presidente", comisionIds: ["pos-etica"] },
      "2026",
    );
    expect(doc).not.toHaveProperty("positions.2026");
    expect(doc).toMatchObject({ name: "Ana Suárez" });
  });

  it("compares comisionIds order-independently", () => {
    const twoComisiones: MemberInput = { ...posInput, comisionIds: ["a", "b"] };
    const doc = toMemberUpdateDoc(
      twoComisiones,
      "uid-admin",
      { cargoId: "pos-presidente", comisionIds: ["b", "a"] },
      "2026",
    );
    expect(doc).not.toHaveProperty("positions.2026");
  });

  it("writes the slot when the cargo changed", () => {
    const doc = toMemberUpdateDoc(
      posInput,
      "uid-admin",
      { cargoId: null, comisionIds: ["pos-etica"] },
      "2026",
    );
    expect(doc["positions.2026"]).toEqual({
      cargoId: "pos-presidente",
      comisionIds: ["pos-etica"],
      assignedBy: "uid-admin",
    });
  });

  it("stamps assignedBy into the created term slot", () => {
    const doc = toMemberCreateDoc(posInput, "uid-admin", "2026");
    expect(doc.positions["2026"]).toEqual({
      cargoId: posInput.cargoId,
      comisionIds: posInput.comisionIds,
      assignedBy: "uid-admin",
    });
  });

  it("stamps assignedBy into the dot-path update slot", () => {
    const doc = toMemberUpdateDoc(posInput, "uid-admin", null, "2026");
    expect(doc["positions.2026"]).toEqual({
      cargoId: posInput.cargoId,
      comisionIds: posInput.comisionIds,
      assignedBy: "uid-admin",
    });
  });
});
