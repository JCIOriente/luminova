import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LINKTREE_SOCIAL_PLATFORMS, type SiteConfigInput } from "@luminova/types";
import { SiteConfigForm } from "./site-config-form";

const validInput: SiteConfigInput = {
  hero: { motto: "Espíritu de Oriente", submotto: "" },
  stats: {
    programCount: 5,
    countries: "100+",
    membersWorldwide: "200.000+",
    nationalAwards: 11,
    efficiencyPct: 100,
    standoutOrg: { year: "2021", title: "OLM" },
  },
  timeline: [{ year: "1993", title: "Fundación", description: "d" }],
  mvv: { mision: "m", vision: "v", valores: "x" },
  reasons: [{ number: "01", title: "Red", body: "b" }],
  contact: {
    email: "a@b.com",
    location: "SC",
    meetingSchedule: "Mié",
    mapUrl: "",
    whatsapp: "",
    broadcastChannel: "",
    socials: { instagram: "", facebook: "", tiktok: "", linkedin: "" },
    links: [{ label: "JCI", url: "https://jci.cc" }],
  },
  linktree: {
    handle: "@jci",
    tagline: "Sé el cambio.",
    taglineAccent: "",
    links: [],
    // The form renders one row per platform, so all must be present (blank url ok).
    socials: LINKTREE_SOCIAL_PLATFORMS.map((platform) => ({ platform, url: "" })),
  },
};

function renderForm(defaultValues: SiteConfigInput) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <SiteConfigForm defaultValues={defaultValues} lastSaved={new Date(0)} onSubmit={onSubmit} />,
  );
  // The submit button is disabled until the form is dirty; edit the open field.
  fireEvent.change(screen.getByLabelText("Lema"), { target: { value: "Nuevo lema" } });
  return { onSubmit };
}

describe("SiteConfigForm error visibility", () => {
  it("reveals a collapsed section that holds an invalid field on submit", async () => {
    const bad = { ...validInput, mvv: { mision: "", vision: "", valores: "x" } };
    renderForm(bad);

    // MVV section starts collapsed — its field is not mounted.
    expect(screen.queryByLabelText("Misión")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    // It auto-expands so the invalid field becomes visible and flagged.
    await waitFor(() => expect(screen.getByLabelText("Misión")).toBeInTheDocument());
    expect(screen.getByLabelText("Misión")).toHaveAttribute("aria-invalid", "true");
  });

  it("counts invalid fields, not top-level sections", async () => {
    const bad = { ...validInput, mvv: { mision: "", vision: "", valores: "x" } };
    const { onSubmit } = renderForm(bad);

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    // Two blank required fields in one section → "2 campos", not "1 campo".
    await waitFor(() =>
      expect(screen.getByText("Corrige 2 campos antes de guardar")).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
