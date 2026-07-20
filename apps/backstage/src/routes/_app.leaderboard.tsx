import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardPage } from "../features/leaderboard/components/leaderboard-page";

export const Route = createFileRoute("/_app/leaderboard")({
  component: LeaderboardPage,
});
