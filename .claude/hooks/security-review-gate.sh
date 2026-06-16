#!/usr/bin/env bash
# PreToolUse(Bash) — security-review hard gate before `gh pr create`.
# When the branch diff touches auth / firestore.rules / apps/beacon, BLOCK
# (exit 2) the PR unless a fresh `Security-Reviewed: <sha>` commit trailer exists
# in the range: the trailer's sha must be an ancestor of HEAD AND no sensitive
# file may have changed after it. Producer side: feature-flow phase 3 stamps the
# trailer once /security-review runs clean. This is the enforcing counterpart to
# post-pr-create.sh, which only reminds.
set -uo pipefail

input=$(cat)

# Fast path: this hook fires on EVERY Bash call. Skip the node spawn unless the
# raw payload even mentions the command. (Authoritative parse re-checks below.)
case "$input" in
  *"gh pr create"*) ;;
  *) exit 0 ;;
esac

cmd=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command||"")}catch{process.stdout.write("")}})')

# Authoritative filter: match `gh pr create` in command position (start of line
# or after a shell separator) so a harmless `echo "gh pr create"` doesn't block.
if ! printf '%s' "$cmd" | grep -qE '(^|[[:space:]]|[;&|(])gh[[:space:]]+pr[[:space:]]+create([[:space:];&|)]|$)'; then
  exit 0
fi

# Operate on the tree the command actually runs in. The PreToolUse payload's
# `.cwd` tracks the real working directory — including a worktree — so a
# worktree-based `gh pr create` is diffed against its OWN branch, not the main
# checkout (which CLAUDE_PROJECT_DIR points at and which may sit on another
# branch, making the gate silently inspect the wrong tree). Fall back to
# CLAUDE_PROJECT_DIR when `.cwd` is absent or unusable.
hookcwd=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).cwd||"")}catch{process.stdout.write("")}})')
cd "${hookcwd:-${CLAUDE_PROJECT_DIR:-.}}" 2>/dev/null \
  || cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null \
  || { echo "security-review-gate: WARN — could not enter a working dir; gate skipped." >&2; exit 0; }

# Resolve the repo default branch from origin/HEAD (fallback main) instead of
# assuming master — a stale origin/master ref would give a bogus merge-base.
default=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
default=${default:-main}
base=$(git merge-base HEAD "origin/$default" 2>/dev/null || git merge-base HEAD "$default" 2>/dev/null || echo "")

# Range undeterminable — don't block (avoid a false gate); warn so it's visible.
if [ -z "$base" ]; then
  echo "security-review-gate: WARN — could not resolve merge-base vs '$default'; gate skipped." >&2
  exit 0
fi

# Keep this path set in sync with post-pr-create.sh's `sensitive` grep.
SENSITIVE='apps/beacon/|firestore\.rules|_auth|_app\.tsx|repositories/|/functions/'

diff=$(git diff --name-only "$base"...HEAD 2>/dev/null || echo "")
sensitive=$(printf '%s\n' "$diff" | grep -E "$SENSITIVE" || true)

# Nothing security-sensitive in the branch — gate does not apply.
if [ -z "$sensitive" ]; then
  exit 0
fi

# Collect Security-Reviewed trailer values across commits in range, then accept
# if any reviewed sha is an ancestor of HEAD with no sensitive change after it.
reviewed=$(git log "$base"..HEAD --format='%(trailers:key=Security-Reviewed,valueonly)' 2>/dev/null | grep -v '^[[:space:]]*$' || true)

fresh=""
if [ -n "$reviewed" ]; then
  while IFS= read -r r; do
    [ -z "$r" ] && continue
    # Only honor a literal sha — a symbolic ref like HEAD/main/<tag> would
    # trivially self-certify (always an ancestor of HEAD, empty diff after it).
    printf '%s' "$r" | grep -qiE '^[0-9a-f]{7,40}$' || continue
    rsha=$(git rev-parse --verify --quiet "${r}^{commit}" 2>/dev/null || echo "")
    [ -z "$rsha" ] && continue
    git merge-base --is-ancestor "$rsha" HEAD 2>/dev/null || continue
    after=$(git diff --name-only "$rsha"..HEAD 2>/dev/null | grep -E "$SENSITIVE" || true)
    if [ -z "$after" ]; then
      fresh="$rsha"
      break
    fi
  done <<< "$reviewed"
fi

if [ -n "$fresh" ]; then
  exit 0
fi

list=$(printf '%s\n' "$sensitive" | sed 's/^/  - /')
head=$(git rev-parse --short HEAD 2>/dev/null || echo HEAD)
echo "security-review-gate: BLOCKED — security-sensitive paths changed without a fresh review:" >&2
echo "$list" >&2
echo "" >&2
echo "Run /security-review on the branch diff, then stamp the reviewed sha:" >&2
echo "  git commit --allow-empty -m 'chore: security-review' -m 'Security-Reviewed: $head'" >&2
echo "(or add the 'Security-Reviewed: <HEAD-sha>' trailer to your next commit)." >&2
echo "The trailer is honored only while no sensitive file changes after that sha." >&2
exit 2
