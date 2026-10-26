import type { Remedy } from "../remedy.ts";

/**
 * How to install each tool the guide needs, per OS (spec S6, checked against the vendors'
 * pages 2026-10-25). macOS assumes Homebrew; Linux means Ubuntu, also inside WSL 2 (S7).
 * docs/adopting.md "Before you start" shows the same commands.
 */
export type Tool = "pnpm" | "java" | "firebase" | "gh" | "gcloud";

type InstallPlatform = "darwin" | "linux";

/** Native Windows gets the WSL row instead (S7); anything else follows Linux. */
const installPlatform = (platform: NodeJS.Platform): InstallPlatform =>
  platform === "darwin" ? "darwin" : "linux";

const SHELL = "shell" as const;

export const INSTALL_FIREBASE_CLI: Remedy = {
  change: "install or update the Firebase CLI (CI pins 15.22.1)",
  run: "npm install -g firebase-tools@15.22.1",
  where: SHELL,
};

/** No nvm yet: its install script, then `nvm install` reads .nvmrc. */
export const INSTALL_NVM: Remedy = {
  change:
    "install nvm if you do not have it, then open a new terminal (https://github.com/nvm-sh/nvm)",
  run: "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash",
  where: SHELL,
};

const both = (remedy: Remedy): Record<InstallPlatform, Remedy> => ({
  darwin: remedy,
  linux: remedy,
});

const INSTALL: Readonly<Record<Tool, Record<InstallPlatform, Remedy>>> = {
  pnpm: both({
    change: "enable pnpm (it comes with Node 24)",
    run: "corepack enable",
    where: SHELL,
  }),
  java: {
    darwin: { change: "install Java 21", run: "brew install --cask temurin@21", where: SHELL },
    linux: {
      change: "install Java 21",
      run: "sudo apt install -y openjdk-21-jre-headless",
      where: SHELL,
    },
  },
  firebase: both(INSTALL_FIREBASE_CLI),
  gh: {
    darwin: { change: "install the GitHub CLI", run: "brew install gh", where: SHELL },
    linux: {
      change:
        "install the GitHub CLI, following https://github.com/cli/cli/blob/trunk/docs/install_linux.md (Debian and Ubuntu)",
    },
  },
  gcloud: {
    darwin: {
      change: "install the Google Cloud CLI",
      run: "brew install --cask gcloud-cli",
      where: SHELL,
    },
    linux: {
      change:
        "install the Google Cloud CLI, following https://cloud.google.com/sdk/docs/install (Debian and Ubuntu)",
    },
  },
};

export const installRemedy = (tool: Tool, platform: NodeJS.Platform = process.platform): Remedy =>
  INSTALL[tool][installPlatform(platform)];
