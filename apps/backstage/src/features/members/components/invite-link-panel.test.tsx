import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteLinkPanel } from "./invite-link-panel";

const URL = "https://backstage.test/invitacion#abc";

describe("InviteLinkPanel", () => {
  it("shows the link, the expiry date and the credential warning", () => {
    render(
      <InviteLinkPanel
        name="Ana"
        url={URL}
        expiresAt={new Date("2026-09-28T12:00:00Z").getTime()}
      />,
    );
    expect(screen.getByText(URL)).toBeInTheDocument();
    // The TIME, not only the date. `/28 sept 2026/` alone also matches the date-only format,
    // so it could not tell the two apart — and at a 48 h TTL a bare date is misleading: a link
    // minted at 23:00 Monday dies at 23:00 Wednesday, which an operator reads as "Wednesday,
    // some time". Rendered on the BOLIVIAN clock (formatInstant), so 12:00Z is 08:00 — the
    // UTC-pinned formatter would have shown 12:00 and promised four hours that do not exist.
    expect(screen.getByText(/28 sept 2026, 08:00/)).toBeInTheDocument();
    // The operator is about to paste a bearer credential into a chat.
    expect(screen.getByText(/chat directo, no en un grupo/i)).toBeInTheDocument();
  });

  it("omits the expiry sentence when there is no date", () => {
    render(<InviteLinkPanel name="Ana" url={URL} expiresAt={null} />);
    expect(screen.queryByText(/Vence el/)).not.toBeInTheDocument();
  });

  it("copies the link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<InviteLinkPanel name="Ana" url={URL} expiresAt={null} />);
    await userEvent.click(screen.getByRole("button", { name: /copiar enlace/i }));
    expect(writeText).toHaveBeenCalledWith(URL);
    expect(await screen.findByRole("button", { name: /enlace copiado/i })).toBeInTheDocument();
  });

  it("keeps the link selectable when copying FAILS", async () => {
    // Clipboard access can be denied (permissions, insecure origin) and this link is the only
    // delivery mechanism — a failed copy must not strand the operator.
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<InviteLinkPanel name="Ana" url={URL} expiresAt={null} />);
    await userEvent.click(screen.getByRole("button", { name: /copiar enlace/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cópialo manualmente/i);
    expect(screen.getByText(URL)).toBeInTheDocument();
  });
});
