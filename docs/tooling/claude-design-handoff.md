# Claude Design ⇄ `@luminova/ui` — sync process

How to keep the **Claude Design** design system (claude.ai/design) and the coded
`@luminova/ui` component library in sync, in both directions. Repeatable — follow
it whenever a new handoff lands or the code library changes.

There is **no automated bridge** between this repo and Claude Design. Both
directions are manual, run by a person + a coding agent.

---

## Direction 1 — code → Claude Design (publish what we have)

Claude Design ingests the repo and builds/updates the org design system from it.

1. Keep `packages/ui/DESIGN.md` current — it's the ingest manifest (tokens +
   component inventory + source paths). Update it whenever components are
   added/removed.
2. In **claude.ai/design** → organization → **link the repo**
   `https://github.com/JCIOriente/luminova` (or **Remix** the existing system and
   attach the repo as reference).
3. Instruct Claude Design to read `packages/ui/DESIGN.md` + `src/theme.css` and
   reconcile. Treat source as a **functional contract**, not a visual spec — it
   should design visuals itself; only the **locked brand tokens** are fixed.
4. Review the generated system; **Publish** when right.

> The manifest deliberately prescribes no visual specs — Claude Design owns the
> look. See the "Authoring note" block in `packages/ui/DESIGN.md`.

## Direction 2 — Claude Design → code (ingest a redesign) ← the migration loop

When designs are ready in Claude Design, hand them off and implement for real.

### 1. Export the handoff
In Claude Design: **Export → Handoff to Claude Code → Send to local coding
agent**. It produces a prompt containing a **bundle URL** (an
`api.anthropic.com/v1/design/h/...` gzip).

### 2. Fetch + extract the bundle
Paste the URL to the agent. The bundle is `application/gzip`:
```
tar xzf <downloaded>.bin -C /tmp/<name>
```
Key files inside `…/project/`:
- `library/comp-*.jsx` — redesigned components (forms/feedback/overlays/data/structure/domain)
- `library/library.css` — the **visual source of truth** (semantic `jci-*` CSS)
- `library/tokens.css` — token values (brand locked + additions)
- `chats/` — the design conversation (**read for intent**)
- `ui_kits/spotlight/` — full marketing-page kit (separate, page-level scope)

### 3. Brainstorm + scope (don't skip)
Run `superpowers:brainstorming`. Decide: styling approach (we use **pure Tailwind
utilities**, `library.css` as spec — never copy `jci-*` CSS into the repo), scope
(component library vs Spotlight pages — keep them separate efforts), and batching
(group by the 6 category files; precede with a token-reconciliation batch). Write
the spec to `docs/superpowers/specs/`.

### 4. Reconcile tokens first (foundation batch)
Diff `tokens.css` against `packages/ui/src/theme.css`. Add missing tokens to the
`@theme` block (so Tailwind generates utilities); **never alter locked brand
values**. This batch is the dependency base for all component batches.

### 5. Migrate components in batches — delta-driven
Per component: diff the handoff (`comp-*.jsx` + matching `library.css` block) vs
the current `src/components/*.tsx`; translate the CSS values to **token-backed
Tailwind utilities**; **preserve the public API** (add new optional props, don't
break existing ones). Keep `cn()`, React peer dep, `motion-reduce:*`, named
export in `src/index.ts` (QR pair stays deep-import). QR widgets: adopt only the
**visual treatment** — keep the real `qrcode.react`/`@zxing` behavior.

### 6. Verify each batch
`pnpm typecheck && pnpm lint && pnpm test`, keep existing unit tests green,
verify visually in the running app, run the `bundle-budget-watcher` subagent.
Checkpoint commit (≤10 files), then the PR (see below).

### 7. Keep `DESIGN.md` in sync
If the inventory or token set changed, update `packages/ui/DESIGN.md` so
Direction 1 stays accurate. This closes the loop.

---

## Branch / PR workflow for a multi-batch migration

- **Token batch** has no dependency → branch off `main`, PR → `main`.
- **Component batches** depend only on the token batch and are mutually
  independent → branch each off the token branch, PR **into the token branch**
  (siblings). When the token PR merges, GitHub auto-retargets them to `main`; they
  then merge in any order.
- A batch that genuinely depends on another component batch → branch off that
  batch's branch and target its PR (stack only where a real dependency exists).
- Conventional Commits with `feat(ui):` scope; one batch per commit/PR; ≤10 files.

## Scope guardrails

- **Component library and Spotlight pages are separate efforts.** A handoff often
  contains both; migrate the component library first, brainstorm the page
  redesign on its own.
- **Brand tokens are locked.** If a handoff proposes off-brand palette/type,
  flag it — don't silently apply.
- **One styling paradigm.** Translate to Tailwind; do not introduce the handoff's
  semantic CSS system into the repo.
