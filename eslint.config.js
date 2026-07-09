import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // eslint-plugin-react-hooks: enforce the Rules of Hooks and complete effect
    // dependency lists across both apps and the shared packages (including the
    // hand-rolled hooks in packages/ui and spotlight's lib/). Both rules are
    // "error" so the `pnpm lint` gate (in every *-ci script and the CI `checks`
    // job) actually blocks — bare `eslint .` exits 0 on warnings, so "warn" would
    // have no teeth. Only the two classic rules are wired; the plugin's
    // recommended-latest additionally enables the React Compiler lint suite
    // (immutability/purity/set-state-in-effect/…), which is a separate, larger
    // initiative and out of scope for this guardrail.
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    // App code must consume @luminova/ui for elements that have a shared
    // component. These elements always have an equivalent, so a raw tag is a
    // duplicate definition. (Raw <button> is intentionally allowed — Button is a
    // pill CTA, not a fit for icon/nav/tab buttons; those stay raw or get a
    // dedicated primitive. packages/ui itself is exempt: it owns the primitives.)
    files: ["apps/*/src/**/*.tsx"],
    ignores: ["**/*.test.tsx", "**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='input']",
          message: "Use <Input> from @luminova/ui instead of a raw <input>.",
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message: "Use <Textarea> from @luminova/ui instead of a raw <textarea>.",
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: "Use <Select> from @luminova/ui instead of a raw <select>.",
        },
        {
          selector: "JSXOpeningElement[name.name='table']",
          message: "Use <Table> from @luminova/ui instead of a raw <table>.",
        },
        {
          // Compact type scale (packages/ui/src/theme.css): sub-18px font sizes
          // are owned by text-ui-2xs/xs/sm/md/lg. An arbitrary text-[Npx] with
          // N<18 is a regression — map it (<=11->2xs, 12->xs, 13->sm, 14->md,
          // 15/16/17->lg). Sizes >=18px (hero/stat/date numerals) don't match
          // and stay allowed. Spotlight uses the fluid brand scale (0 sub-18
          // arbitrary sizes today), so this is effectively a backstage guard.
          selector: "Literal[value=/text-\\[(?:[0-9]|1[0-7])(?:\\.[0-9]+)?px\\]/]",
          message:
            "Arbitrary sub-18px font-size: use the text-ui-* compact scale from @luminova/ui (see DESIGN.md).",
        },
        {
          // Colors live in packages/ui/src/theme.css as tokens (--color-*), which
          // generate utilities (text-jci-blue, bg-surface-2, border-line). A raw
          // hex/rgb literal inside a Tailwind arbitrary-value color utility
          // (text-[#…], bg-[rgba(…)], border-[#…], from-[#…]) bypasses the token —
          // it can't be remapped by dark mode and drifts from the palette. The
          // `-[` anchor ties this to a utility, so structural arbitrary values
          // (grid-cols-[…], data-[state=…]) don't match. Where a color literal is
          // genuinely unavoidable (a gradient color stop or SVG fill that can't
          // take a var()), it belongs in an inline style={{…}} derived from a
          // token and centralized once — that path is a `style` object, not a
          // className string Literal, so it isn't matched here. See
          // docs/reuse-first-ui.md.
          selector: "Literal[value=/-\\[(?:#[0-9a-fA-F]{3,8}|rgba?\\()/]",
          message:
            "Raw hex/rgb color in className: use a theme.css token utility (e.g. text-jci-blue, bg-surface-2, border-line). See docs/reuse-first-ui.md.",
        },
      ],
    },
  },
  {
    // Spotlight is the public, no-auth site. It must only touch Firestore via the
    // lite SDK; importing the @luminova/firebase barrel pulls the full firebase
    // SDK (auth/storage/functions/app-check) into the public bundle. Steer to the
    // /lite subpath, which only carries firebase/app + firebase/firestore/lite.
    files: ["apps/spotlight/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@luminova/firebase",
              message: "Spotlight is public/lite-only. Import from '@luminova/firebase/lite'.",
            },
          ],
        },
      ],
    },
  },
);
