import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { Route } from "./contact";

const submitLead = vi.fn().mockResolvedValue(undefined);

vi.mock("../leads/submit-lead", () => ({
  submitLead: (...args: unknown[]) => submitLead(...args),
}));

vi.mock("../site-config/use-site-config", () => ({
  useSiteConfig: () => ({
    contact: {
      email: "hola@jci.test",
      location: "Santa Cruz",
      meetingSchedule: "Martes",
      mapUrl: "",
      whatsapp: "",
      broadcastChannel: "",
    },
  }),
}));

// fireEvent.change, not user-event (not a spotlight devDependency): React sees one change
// event carrying the whole new value, which is exactly what a paste or a burst of keys delivers.
const enter = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

// Route files export only `Route` (autoCodeSplitting), so the page is reached through it.
const Contact = Route.options.component as ComponentType;

describe("contact form phone", () => {
  it("caps typed digits at 8 and submits exactly those", async () => {
    render(<Contact />);
    enter(screen.getByLabelText(/^nombre/i), "Ana");
    enter(screen.getByLabelText(/^email/i), "ana@x.co");
    enter(screen.getByLabelText(/^mensaje/i), "Hola");
    const phone = screen.getByLabelText<HTMLInputElement>(/whatsapp/i);
    enter(phone, "7001234567890");
    expect(phone.value).toBe("70012345");
    fireEvent.click(screen.getByRole("button", { name: /enviar mensaje/i }));
    await waitFor(() => expect(submitLead).toHaveBeenCalled());
    expect(submitLead.mock.calls[0]?.[0]).toMatchObject({ phone: "70012345" });
  });

  it("caps an over-long paste and keeps a pasted +591 number whole", () => {
    render(<Contact />);
    const phone = screen.getByLabelText<HTMLInputElement>(/whatsapp/i);
    enter(phone, "7001 2345 6789");
    expect(phone.value).toBe("70012345");
    enter(phone, "+591 700 00000");
    expect(phone.value).toBe("70000000");
  });
});
