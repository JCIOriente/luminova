import { createFileRoute } from "@tanstack/react-router";
import { LinktreePage } from "../components/linktree-page";

export const Route = createFileRoute("/linktree")({
  component: LinktreePage,
});
