import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

// Shared no-restricted-syntax entries. Kept in a const because flat config
// replaces (not merges) a rule's options when a later block matches the same
// file — any narrower block re-spreads this base to avoid clobbering it.
const RESTRICTED_SYNTAX_BASE = [
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
];

// Asking a raw ability directly instead of going through lib/authz/probe. Matched on the
// ability RECEIVER, not on `.can` generally, because `gate.can(action, "Subject")` — the
// useCan API — is the correct spelling and must not be flagged. Shared by the two authz
// blocks below, which cover disjoint file sets.
const RAW_ABILITY_CALL_SELECTORS = [
  {
    selector:
      "CallExpression[callee.object.name='ability'][callee.property.name='can'], CallExpression[callee.object.callee.name=/^(useAbility|buildAbility)$/][callee.property.name='can']",
    message:
      "Do not ask a raw ability directly — call abilityAllows(ability, action, subject, fields?) from lib/authz/probe, which probes an empty subject instance so a conditional own-doc grant can't answer a collection-level question.",
  },
];

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
      "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX_BASE],
    },
  },
  {
    // Authz gates must ask the ability a question firestore.rules can also answer.
    // `ability.can(action, "Member")` asks a subject-TYPE question, which is true whenever
    // ANY rule for that subject exists — including the uid-scoped own-doc grants in
    // packages/auth's applyConditional. That is how every member came to see Editar /
    // Desactivar / Desafiliar on every row. Go through `useCan().can` or `<Can>` (which
    // probe an empty instance and take the document's fields), or hand `subject(...)` in
    // yourself. Only the authz module itself and nav-config (which owns the route policy
    // and needs buildAbility for the beforeLoad guard) may hold a raw ability.
    // The two blocks below cover DISJOINT file sets on purpose: flat config REPLACES a
    // rule's options when a later block matches the same file, so overlapping blocks
    // would silently drop the earlier selectors (verified — it happened here first).
    files: ["apps/backstage/src/**/*.{ts,tsx}"],
    // Tests build abilities on purpose — that is how the gates get proven.
    ignores: [
      "apps/backstage/src/lib/authz/**",
      "apps/backstage/src/components/nav-config.ts",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RESTRICTED_SYNTAX_BASE,
        ...RAW_ABILITY_CALL_SELECTORS,
        {
          // Namespace form too: `import * as ctx` then `ctx.useAbility()` was a verified
          // way around a specifier-only ban.
          selector:
            "ImportSpecifier[imported.name=/^(useAbility|buildAbility)$/], ImportNamespaceSpecifier",
          message:
            "Use useCan() (or <Can>) instead of a raw ability: those probe an empty subject instance, so a conditional own-doc grant can't answer a collection-level question. Namespace imports are banned here because they hide which binding is taken.",
        },
      ],
    },
  },
  {
    // The files that legitimately HOLD a raw ability — the authz module and the nav/route
    // policy. They may import it; they still may not ask it a subject-TYPE question.
    // probe.ts is the one exemption: it is where the empty-instance probe lives.
    files: ["apps/backstage/src/lib/authz/**", "apps/backstage/src/components/nav-config.ts"],
    ignores: ["apps/backstage/src/lib/authz/probe.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX_BASE, ...RAW_ABILITY_CALL_SELECTORS],
    },
  },
  {
    // Public jargon (docs/specs/2026-07-10-impacto-unification-design.md):
    // "iniciativa" is banned from spotlight copy — the public umbrella word is
    // "proyecto". Backstage keeps its internal taxonomy vocabulary, so this is
    // spotlight-only. ("programa" can't be linted: it stays legal when it means
    // the annual institutional programs.) Covers .ts too — siteConfig defaults
    // hold public copy in plain string literals.
    files: ["apps/spotlight/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.tsx", "**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RESTRICTED_SYNTAX_BASE,
        {
          selector: "JSXText[value=/iniciativa/i]",
          message:
            "Public jargon: 'iniciativa' is banned in spotlight copy — use 'proyecto'. See docs/specs/2026-07-10-impacto-unification-design.md.",
        },
        {
          selector: "Literal[value=/iniciativa/i]",
          message:
            "Public jargon: 'iniciativa' is banned in spotlight copy — use 'proyecto'. See docs/specs/2026-07-10-impacto-unification-design.md.",
        },
      ],
    },
  },
  {
    // The FCM background service worker is a static file copied verbatim to the
    // dist root (it can't be a module — a SW registered by the browser can't read
    // import.meta.env). It runs in the ServiceWorkerGlobalScope and pulls firebase
    // via importScripts (compat CDN build), so declare those globals rather than
    // let no-undef flag every `self`/`clients`/`firebase`/`importScripts`.
    files: ["apps/*/public/firebase-messaging-sw.js"],
    languageOptions: {
      globals: {
        self: "readonly",
        clients: "readonly",
        importScripts: "readonly",
        firebase: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
      },
    },
  },
  {
    // Spotlight is the public, no-auth site. It must only touch Firestore via the
    // lite SDK; importing the @luminova/firebase barrel pulls the full firebase
    // SDK (auth/storage/functions) into the public bundle. Steer to the /lite
    // subpath, which carries firebase/app + firebase/firestore/lite + firebase/app-check
    // (App Check is required so lite reads/writes send a token under enforcement).
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
