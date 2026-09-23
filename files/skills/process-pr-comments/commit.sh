#!/usr/bin/env bash
# Commit wrapper for the process-pr-comments skill. The user denies raw
# git add/commit to Claude globally; this script is the one narrow path the
# skill may use, with guardrails so it can only commit feedback changes.
#
# Usage:
#   commit.sh begin
#       Record a baseline of files that already have uncommitted changes.
#       Run once before editing anything. Those files can't be committed later.
#   commit.sh commit [-m BODY] -- FILE...
#       Stage exactly FILE... and commit them as "🟢 reviewer feedback".
#       BODY is optional: at most 3 lines, each at most 72 characters.
#
# The script never pushes.
set -euo pipefail

TITLE="🟢 reviewer feedback"
TRAILER="Co-Authored-By: Claude <noreply@anthropic.com>"
MAX_BODY_LINES=3
MAX_LINE_LEN=72

die() { echo "ERROR: $*" >&2; exit 1; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository."
GIT_DIR="$(git rev-parse --absolute-git-dir)"
BASELINE="$GIT_DIR/process-pr-comments.baseline"

# dirty_paths prints every path with staged, unstaged, or untracked changes.
dirty_paths() {
  git status --porcelain=v1 -z --untracked-files=all | while IFS= read -r -d '' entry; do
    printf '%s\n' "${entry:3}"
    # renames/copies carry the original path as an extra NUL-separated field
    [[ "${entry:0:1}" == [RC] ]] && IFS= read -r -d '' orig && printf '%s\n' "$orig"
  done
}

cmd_begin() {
  (cd "$ROOT" && dirty_paths) > "$BASELINE"
  local n; n="$(grep -c . "$BASELINE" || true)"
  echo "Baseline recorded: $n file(s) with pre-existing changes (off-limits for commit)."
  [[ "$n" -gt 0 ]] && sed 's/^/  /' "$BASELINE"
  return 0
}

cmd_commit() {
  local body=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -m) [[ $# -ge 2 ]] || die "-m needs a value."; body="$2"; shift 2 ;;
      --) shift; break ;;
      *) die "unexpected argument '$1' (files go after --)." ;;
    esac
  done
  [[ $# -gt 0 ]] || die "no files given. List every file explicitly after --."

  [[ -f "$BASELINE" ]] || die "no baseline. Run 'commit.sh begin' before editing files."

  # branch / repo state
  local branch
  branch="$(git symbolic-ref --quiet --short HEAD)" || die "detached HEAD; refusing to commit."
  case "$branch" in main|master) die "on '$branch'; refusing to commit to the default branch." ;; esac
  local default
  default="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  [[ -n "$default" && "$branch" == "${default#origin/}" ]] && die "on default branch '$branch'; refusing."
  for f in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD REVERT_HEAD; do
    [[ -e "$GIT_DIR/$f" ]] && die "a merge/rebase/cherry-pick is in progress; refusing."
  done
  [[ -d "$GIT_DIR/rebase-merge" || -d "$GIT_DIR/rebase-apply" ]] && die "a rebase is in progress; refusing."
  git diff --cached --quiet || die "the index already has staged changes; refusing to mix them in."

  # message body
  if [[ -n "$body" ]]; then
    local lines; lines="$(printf '%s\n' "$body" | wc -l)"
    [[ "$lines" -le $MAX_BODY_LINES ]] || die "body has $lines lines; max is $MAX_BODY_LINES."
    while IFS= read -r line; do
      [[ ${#line} -le $MAX_LINE_LEN ]] || die "body line exceeds $MAX_LINE_LEN chars: '$line'"
    done <<< "$body"
  fi

  # files: explicit, inside the repo, changed, and not dirty before the skill ran
  local arg f dirty files=()
  dirty="$(cd "$ROOT" && dirty_paths)"
  for arg in "$@"; do
    case "$arg" in -*|.|./|*'*'*|*'?'*|*'['*) die "'$arg' is not an explicit file path." ;; esac
    [[ -d "$arg" ]] && die "'$arg' is a directory; list files individually."
    # resolve relative to the caller's cwd into a repo-root-relative path
    f="$(git ls-files --full-name --cached --others --exclude-standard -- "$arg" | head -n1)"
    [[ -n "$f" ]] || die "'$arg' is not a file in this repository."
    grep -qxF -- "$f" <<< "$dirty" || die "'$f' has no changes to commit."
    grep -qxF -- "$f" "$BASELINE" && die "'$f' had uncommitted changes before feedback processing began; commit it yourself."
    files+=("$f")
  done

  local msg; msg="$(mktemp)"
  trap 'rm -f "$msg"' EXIT
  { echo "$TITLE"; [[ -n "$body" ]] && printf '\n%s\n' "$body"; printf '\n%s\n' "$TRAILER"; } > "$msg"

  cd "$ROOT"
  git add -- "${files[@]}"
  git commit --quiet -F "$msg" -- "${files[@]}"
  git log -1 --stat --format='committed %h on '"$branch"'%n%n%B'
}

case "${1:-}" in
  begin) shift; cmd_begin "$@" ;;
  commit) shift; cmd_commit "$@" ;;
  *) die "usage: commit.sh begin | commit.sh commit [-m BODY] -- FILE..." ;;
esac
