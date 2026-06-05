---
name: release-notes
description: >-
  Turn a range of Conventional Commits into grouped, human-readable release
  notes. Use when the user asks to "write release notes", "draft a changelog",
  "summarize commits since <tag/date>", "what changed in this release", or before
  cutting a deploy/tag. Reads `git log` for the range, groups by commit type and
  module scope, and emits Markdown. Do NOT invent changes — only summarize commits
  that exist in the range.
---

# release-notes

Reshape Conventional Commits into grouped notes. Never fabricate entries.

## Steps

1. **Resolve the range.** Ask for / infer the range. Defaults:
   - Since last tag: `git describe --tags --abbrev=0` → `<tag>..HEAD`.
   - Since a date: `git log --since="<date>"`.
   - Explicit: `<from>..<to>`.

2. **Read commits.**
   ```bash
   git log <range> --no-merges --pretty=format:'%s|%h'
   ```

3. **Parse Conventional Commits.** Each subject `type(scope): description`.
   - Map `type` → section: `feat`→Features, `fix`→Fixes, `perf`→Performance,
     `refactor`→Internal, `docs`→Docs, `chore`/`build`/`ci`→Maintenance.
   - `scope` (e.g. `backstage`, `beacon`, `ui`, `auth`) → sub-grouping or prefix.
   - A `!` after type/scope or a `BREAKING CHANGE:` footer → **Breaking Changes**
     section at the top.

4. **Emit Markdown.** Order: Breaking Changes → Features → Fixes → Performance →
   the rest. Within each, group by scope. One bullet per commit:
   `- <description> (<short-hash>)`. Drop the type/scope prefix from the bullet
   text. Omit empty sections.

5. **Flag non-conventional commits.** List any subjects that didn't parse under a
   "Needs manual review" note rather than silently dropping them.

## Output shape

```markdown
## <range or version> — <date>

### Breaking Changes
- <…> (abc1234)

### Features
- **backstage:** member soft-delete with restore (def5678)
- **beacon:** awardPoints handles event deletion (aaa1111)

### Fixes
- **ui:** combobox keyboard nav (bbb2222)
```

Convert relative dates to absolute (YYYY-MM-DD) in the heading.
