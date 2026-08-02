import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";

const mutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock("../hooks/use-update-self-profile", () => ({
  useUpdateSelfProfile: () => ({ mutateAsync, isError: false, isSuccess: false }),
}));

import { SelfProfileForm } from "./self-profile-form";

const member: Member = {
  id: "m1",
  name: "Ana Rivas",
  email: "ana@example.com",
  phone: "70011223",
  profession: "Arquitecta",
  joinDate: Timestamp.fromDate(new Date("2020-03-15T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1992-07-01T00:00:00Z")),
  status: "Activo",
  profilePicture: null,
  totalPoints: 0,
  active: true,
  deletedAt: null,
};

async function submitWithName(value: string, on: Member = member) {
  const user = userEvent.setup();
  render(<SelfProfileForm member={on} />);
  const input = screen.getByLabelText(/Nombre/);
  await user.clear(input);
  await user.type(input, value);
  await user.click(screen.getByRole("button", { name: /Guardar/ }));
}

describe("SelfProfileForm", () => {
  beforeEach(() => mutateAsync.mockClear());

  it("pre-fills the member's current name", () => {
    render(<SelfProfileForm member={member} />);
    expect(screen.getByLabelText(/Nombre/)).toHaveValue("Ana Rivas");
  });

  // The form is the first gate: an invalid name must never reach the repository, or the
  // member gets a generic permission-denied from the rules instead of a field error.
  it("blocks a name the rules would reject and never calls the mutation", async () => {
    await submitWithName("Ana Rivas 2");
    expect(await screen.findByText(/Solo letras/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("blocks a name below the minimum length", async () => {
    await submitWithName("Al");
    expect(await screen.findByText(/Mínimo 3 caracteres/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // firestore.rules has no normalizer and denies untrimmed/doubled-space names outright,
  // so the form MUST send the normalized value — otherwise a member who types a stray
  // space gets a denied write with no explanation.
  it("normalizes whitespace before submitting", async () => {
    await submitWithName("  ana   maría  rivas  ");
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: "ana maría rivas" }));
  });

  // The client mirror of touched('name'). Without it, a member enrolled before
  // memberNameValid() existed cannot save ANY field — the form blocks on a name they never
  // touched, and the rules' legacy affordance is unreachable from the UI.
  describe("a member whose stored name predates the pattern", () => {
    const legacy: Member = { ...member, name: "Ana Rivas 2" };

    it("can still save other fields without touching the name", async () => {
      const user = userEvent.setup();
      render(<SelfProfileForm member={legacy} />);
      await user.clear(screen.getByLabelText(/Profesión/));
      await user.type(screen.getByLabelText(/Profesión/), "Ingeniera");
      await user.click(screen.getByRole("button", { name: /Guardar/ }));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      // Sent verbatim, not normalized: the rules see no diff on name, so the gate never runs.
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Ana Rivas 2", profession: "Ingeniera" }),
      );
    });

    it("is still blocked from changing it to another invalid name", async () => {
      await submitWithName("Ana Rivas 3", legacy);
      expect(await screen.findByText(/Solo letras/)).toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("can repair it to a valid one", async () => {
      await submitWithName("Ana Rivas", legacy);
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: "Ana Rivas" }));
    });
  });

  // Consent alone publishes nothing: the beacon projection drops a member with no
  // portrait, which is exactly how a director stayed invisible after ticking the box.
  describe("the public-profile photo warning", () => {
    const PHOTO_WARNING = /te falta subir tu foto/i;
    const opted = (o: Partial<Member> = {}): Member => ({ ...member, publicProfile: true, ...o });

    it("warns when the member is opted in but has no photo", () => {
      render(<SelfProfileForm member={opted()} />);
      expect(screen.getByText(PHOTO_WARNING)).toBeInTheDocument();
    });

    it("drops the warning once a photo exists", () => {
      render(<SelfProfileForm member={opted({ profilePicture: "https://example.test/p.jpg" })} />);
      expect(screen.queryByText(PHOTO_WARNING)).not.toBeInTheDocument();
    });

    it("stays quiet when the member has opted out", () => {
      render(<SelfProfileForm member={opted({ publicProfile: false })} />);
      expect(screen.queryByText(PHOTO_WARNING)).not.toBeInTheDocument();
    });

    it("stays quiet for a legacy member who never decided", () => {
      render(<SelfProfileForm member={{ ...member, publicProfile: undefined }} />);
      expect(screen.queryByText(PHOTO_WARNING)).not.toBeInTheDocument();
    });
  });
});
