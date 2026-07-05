#!/usr/bin/env bash
# Fetch all comments for a GitHub PR in one call:
#   - PR metadata + the last commit's timestamp (to tell what is "latest")
#   - top-level reviews (approvals / change requests / summaries)
#   - inline review threads WITH resolved/outdated status + reply/resolve ids
#   - general conversation (issue) comments
#
# Usage: fetch.sh [PR_NUMBER]
#   PR_NUMBER is optional. If omitted, it is resolved from the PR associated
#   with the current git branch. Must be run inside the repo's working tree.
set -euo pipefail

PR="${1:-}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh (GitHub CLI) is not installed." >&2
  exit 1
fi

# Repo in owner/name form; must be run inside a git repo with a GitHub remote.
if ! REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)"; then
  echo "ERROR: not inside a GitHub repository (or gh is not authenticated)." >&2
  echo "Run this from the repo's working tree, or authenticate with 'gh auth login'." >&2
  exit 1
fi
OWNER="${REPO%%/*}"
NAME="${REPO##*/}"

# Resolve the PR number from the current branch when not supplied.
if [[ -z "$PR" ]]; then
  PR="$(gh pr view --json number --jq .number 2>/dev/null || true)"
  if [[ -z "$PR" ]]; then
    echo "ERROR: no PR number given and no open PR is associated with the current branch." >&2
    echo "Pass one explicitly, e.g.: fetch.sh 123" >&2
    exit 1
  fi
fi

# emit TITLE CONTENT — prints a section header, or "(none)" when CONTENT is blank.
emit() {
  echo "### $1"
  if [[ -z "${2//[$'\n\r\t ']/}" ]]; then echo "(none)"; else printf '%s\n' "$2"; fi
  echo
}

echo "### REPO"; echo "$REPO"; echo

emit "PR" "$(gh pr view "$PR" --repo "$REPO" \
  --json number,title,url,author,headRefName,baseRefName,state,isDraft,updatedAt \
  --jq '"#\(.number) \(.title)\n\(.url)\nauthor: \(.author.login)  |  \(.headRefName) -> \(.baseRefName)  |  state: \(.state)  |  draft: \(.isDraft)  |  updated: \(.updatedAt)"' 2>/dev/null || true)"

emit "LAST_COMMIT (anything newer than this is feedback since your last push)" "$(gh pr view "$PR" --repo "$REPO" --json commits \
  --jq '.commits[-1] | "\(.committedDate)  \(.oid[0:8])  \(.messageHeadline)"' 2>/dev/null || true)"

emit "REVIEWS (top-level: approvals / change requests / summaries)" "$(gh api "repos/$REPO/pulls/$PR/reviews" --paginate \
  --jq '.[] | select(.state!="PENDING") | select((.body // "")!="" or .state!="COMMENTED") | "[\(.submitted_at)] \(.user.login // "ghost") — \(.state)" + (if (.body // "")=="" then "" else "\n\(.body)" end) + "\n---"' 2>/dev/null || true)"

emit "REVIEW_THREADS (inline code comments; resolve/reply with the ids shown)" "$(gh api graphql \
  -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{id isResolved isOutdated path line comments(first:50){nodes{databaseId author{login} createdAt body}}}}}}}' \
  -f owner="$OWNER" -f repo="$NAME" -F pr="$PR" \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | "THREAD id=\(.id) resolved=\(.isResolved) outdated=\(.isOutdated) reply_to=\(.comments.nodes[0].databaseId) \(.path):\(.line // "?")\n" + ([.comments.nodes[] | "  [\(.createdAt)] \(.author.login // "ghost"): \(.body)"] | join("\n")) + "\n---"' 2>/dev/null || true)"

emit "ISSUE_COMMENTS (general conversation)" "$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
  --jq '.[] | "[\(.created_at)] \(.user.login // "ghost"):\n\(.body)\n---"' 2>/dev/null || true)"
