import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import type { ShowcaseItem } from "@luminova/types/engine";
import { makeShowcaseItem, renderWithRouter } from "../../test/showcase";
import { DetailContent } from "./showcase-detail";

const mkItem = (kind: ShowcaseItem["kind"]) =>
  makeShowcaseItem({
    kind,
    title: "Titulo X",
    description: "desc",
    endDate: Timestamp.fromMillis(86400000),
    completedAt: Timestamp.fromMillis(86400000),
    impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "resumen" },
  } as Partial<ShowcaseItem>);

describe("DetailContent kind awareness", () => {
  it("shows Programa anual chip and El programa eyebrow for Program", async () => {
    renderWithRouter(<DetailContent item={mkItem("Program")} />, ["/impacto"]);
    expect(await screen.findByText("Programa anual")).toBeInTheDocument();
    expect(screen.getByText("El programa")).toBeInTheDocument();
  });
  it("shows El proyecto eyebrow and no chip for Project", async () => {
    renderWithRouter(<DetailContent item={mkItem("Project")} />, ["/impacto"]);
    expect(await screen.findByText("El proyecto")).toBeInTheDocument();
    expect(screen.queryByText("Programa anual")).not.toBeInTheDocument();
  });
});
