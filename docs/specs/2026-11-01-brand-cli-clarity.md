# Brand CLI clarity

The people who run `pnpm brand:*` are chapter volunteers, often not developers. The commands
are honest but read like a log: the verdict is at the bottom, long values run past the edge
of the window, and labels such as "CD identity" and "gcloud ADC" assume the reader knows the
deploy pipeline.

## Decisions

1. **One renderer.** `cli/rows.ts` draws every status report as a bordered table with
   `Status` and `Details` columns; the section title heads the first column. Columns line up
   across sections. No dependency: `cli/table.ts` is enough.
2. **Text wraps inside the table.** The table fits the window, capped at 120 columns, and
   uses 100 when there is no window (a pipe, CI). Only the last column gives up width, down
   to 16 columns, so a window under about 57 scrolls; a word longer than the column breaks.
3. **Status in words.** `✓ OK`, `! Note`, `✗ Problem`, `- Skipped`. No colour, so the output
   reads the same in a pipe and in a CI log.
4. **Stable ids, plain labels.** `CheckRow.check` stays the id code and tests use.
   `ROW_LABELS` maps it to what the reader sees ("Deploy sign-in", "GitHub account"). An
   image's row keeps its path.
5. **Verdict first.** `brand:check` opens with one line: problems to fix, notes worth a
   look, no problems so far (checks still wait for going live), or everything ready. The
   exit code is unchanged.
6. **"To fix:" means a problem.** When only notes remain, the same block is titled
   "Worth a look:".
7. **`--repo` on every `gh` hint.** In a fork, `gh` may default to upstream, so a printed
   command always names the repository: the fork when known, otherwise a placeholder that
   fails loudly when pasted. `brand:push` looks the fork up as `brand:check` does.
8. **`brand:pull` lists files only in CD.** A chapter gets the count; the CD log keeps each
   file's generation.

## Out of scope

`brand:guard` and `brand:icons` keep their text: maintainers run them, and they report steps,
not status. Colour and a `--json` mode wait until someone asks.
