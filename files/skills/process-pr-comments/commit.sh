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
#       Stage FILE... and commit them as "🟢 reviewer feedback", together with
#       whatever the user already staged (their staging is an instruction to
#       include it).
#       BODY is optional: at most 3 lines, each at most 72 characters.
#   commit.sh push
#       Push the current branch to its upstream, fast-forward only. Refuses
#       unless every unpushed commit is a "🟢 reviewer feedback" commit, so
#       it never publishes the user's own unpushed work.
set -euo pipefail

TITLE="🟢 reviewer feedback"
TRAILER=""
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
    # an if, not `&&`: a false test as the body's last command would make the loop (and,
    # under pipefail, every caller's command substitution) fail on any non-rename entry
    if [[ "${entry:0:1}" == [RC] ]]; then
      IFS= read -r -d '' orig && printf '%s\n' "$orig"
    fi
  done
}

cmd_begin() {
  (cd "$ROOT" && dirty_paths) > "$BASELINE"
  local n; n="$(grep -c . "$BASELINE" || true)"
  echo "Baseline recorded: $n file(s) with pre-existing changes (off-limits for commit)."
  [[ "$n" -gt 0 ]] && sed 's/^/  /' "$BASELINE"
  return 0
}

# require_branch sets `branch` to the current branch and refuses detached HEAD,
# the default branch, and in-progress merges/rebases/cherry-picks.
require_branch() {
  local action="$1"
  branch="$(git symbolic-ref --quiet --short HEAD)" || die "detached HEAD; refusing to $action."
  case "$branch" in main|master) die "on '$branch'; refusing to $action the default branch." ;; esac
  local default
  default="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  [[ -n "$default" && "$branch" == "${default#origin/}" ]] && die "on default branch '$branch'; refusing."
  for f in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD REVERT_HEAD; do
    [[ -e "$GIT_DIR/$f" ]] && die "a merge/rebase/cherry-pick is in progress; refusing."
  done
  [[ -d "$GIT_DIR/rebase-merge" || -d "$GIT_DIR/rebase-apply" ]] && die "a rebase is in progress; refusing."
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

  local branch
  require_branch "commit to"

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
  # expanded now: `msg` is local and gone by the time the EXIT trap runs under `set -u`
  trap "rm -f '$msg'" EXIT
  { echo "$TITLE"; [[ -n "$body" ]] && printf '\n%s\n' "$body"; printf '\n%s\n' "$TRAILER"; } > "$msg"

  cd "$ROOT"
  git add -- "${files[@]}"
  git commit --quiet -F "$msg"
  git log -1 --stat --format='committed %h on '"$branch"'%n%n%B'
}

cmd_push() {
  [[ $# -eq 0 ]] || die "push takes no arguments."
  local branch
  require_branch "push"

  # only the branch's own upstream, under the same name: no new remote branches
  local remote merge
  remote="$(git config --get "branch.$branch.remote" || true)"
  merge="$(git config --get "branch.$branch.merge" || true)"
  [[ -n "$remote" && -n "$merge" ]] || die "'$branch' has no upstream; push it yourself the first time."
  [[ "$remote" != "." ]] || die "'$branch' tracks a local branch; refusing."
  [[ "$merge" == "refs/heads/$branch" ]] || die "'$branch' tracks '$remote/${merge#refs/heads/}', a different name; refusing."
  local upstream="$remote/$branch"

  git fetch --quiet "$remote" "$merge" || die "could not fetch '$upstream'."
  git rev-parse --verify --quiet "refs/remotes/$upstream" >/dev/null || die "no remote-tracking ref for '$upstream'."

  local behind
  behind="$(git rev-list --count "HEAD..refs/remotes/$upstream")"
  [[ "$behind" -eq 0 ]] || die "'$upstream' has $behind commit(s) not in '$branch'; integrate them yourself first."

  local c commits=() foreign=()
  while IFS= read -r c; do commits+=("$c"); done < <(git rev-list --reverse "refs/remotes/$upstream..HEAD")
  [[ ${#commits[@]} -gt 0 ]] || die "nothing to push; '$branch' matches '$upstream'."
  for c in "${commits[@]}"; do
    [[ "$(git log -1 --format=%s "$c")" == "$TITLE" ]] || foreign+=("  $(git log -1 --format='%h %s' "$c")")
  done
  [[ ${#foreign[@]} -eq 0 ]] || die "unpushed commits that aren't reviewer feedback; push them yourself:
$(printf '%s\n' "${foreign[@]}")"

  # explicit refspec (ignores push.default); no force, so a moved remote is rejected
  git push --quiet "$remote" "HEAD:$merge"
  echo "pushed ${#commits[@]} commit(s) to $upstream:"
  for c in "${commits[@]}"; do git log -1 --format='  %h %s' "$c"; done
}

case "${1:-}" in
  begin) shift; cmd_begin "$@" ;;
  commit) shift; cmd_commit "$@" ;;
  push) shift; cmd_push "$@" ;;
  *) die "usage: commit.sh begin | commit.sh commit [-m BODY] -- FILE... | commit.sh push" ;;
esac
