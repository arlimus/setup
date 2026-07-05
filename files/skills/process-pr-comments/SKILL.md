---
name: process-pr-comments
description: Pull the latest comments from a GitHub pull request and process them — fetch new reviews, inline code threads, and conversation comments, triage what is actionable, and address the feedback. Use when the user says "pull the latest comments from PR #NUM and process them" or asks to process/address the newest comments on a PR. The PR number is optional; if omitted, resolve it from conversation context or the current branch.
allowed-tools: Bash(/home/zero/.claude/skills/process-pr-comments/fetch.sh:*), Bash(gh *), Bash(git *), Read, Grep, Glob, Edit, Write, Task
argument-hint: "[pr-number]"
---

# Pull & Process the Latest PR Comments

Fetch the newest feedback on a pull request, triage it, and work through each actionable item.

## Step 0: Determine the PR number

The user provided: `$ARGUMENTS`

Resolve the PR number in this priority order:

1. **Explicit number** in `$ARGUMENTS` (e.g. `#123` or `123`) — use it.
2. **Conversation context** — if no number was given but a specific PR was already established earlier in this session (the user or a prior tool result referenced it), use that number. Say which PR you inferred so the user can correct you.
3. **Current branch** — if neither of the above applies, pass no number to `fetch.sh`; it resolves the PR associated with the current git branch.

Do **not** guess a number. If context is ambiguous or the branch has no PR, the script will error — surface that and ask the user which PR they mean.

## Step 1: Fetch the comments

Run the helper exactly once. Pass the number if you have one; omit it to resolve from the current branch.

```bash
/home/zero/.claude/skills/process-pr-comments/fetch.sh <pr-number-or-empty>
```

**Invoke it bare** — no pipes, no `head`/`tail`, no `bash -c` wrapper — so it stays within the pre-authorized Bash pattern and doesn't prompt.

It prints these sections to stdout:
- `### REPO` — `owner/name`
- `### PR` — number, title, url, author, `head -> base`, state, draft, updated-at
- `### LAST_COMMIT` — the last commit's timestamp; **anything created after this is feedback since the last push**
- `### REVIEWS` — top-level reviews: `APPROVED` / `CHANGES_REQUESTED` / `COMMENTED` with summary bodies
- `### REVIEW_THREADS` — inline code comments, each as a thread with `resolved=`, `outdated=`, a `reply_to=<comment-id>`, a thread `id=<node-id>`, and `path:line`
- `### ISSUE_COMMENTS` — general conversation comments

If the script exits non-zero (not in a repo, not authenticated, no PR on the branch), report the message verbatim and stop.

## Step 2: Triage — identify what is "latest" and what needs action

"Latest comments" means the new feedback the user hasn't handled yet. Build the working set as:

- **Threads where `resolved=false`** — the primary work, regardless of age. Resolved threads are done; skip them unless the user asks otherwise.
- **Any comment/review with a timestamp newer than `LAST_COMMIT`** — feedback that landed since the last push.

Then classify each item in the working set:

| Class | What it is | How to process |
|-------|-----------|----------------|
| **Actionable** | A concrete change request or bug | Locate the code, make the fix |
| **Question** | Reviewer asking why/how | Draft an answer; only change code if the answer reveals a real issue |
| **Nit / style** | Minor suggestion | Apply if cheap and reasonable; otherwise note it |
| **Already addressed** | Points at code that has since changed (often `outdated=true`) | Skip; note it's stale |
| **Informational** | Praise, FYI, "LGTM" | No action |

Deprioritize `outdated=true` threads — the code they point at has moved. Confirm before treating one as still-relevant.

If nothing in the working set is newer than `LAST_COMMIT` and every thread is resolved, say so plainly — there is nothing new to process — and stop rather than inventing work.

## Step 3: Present the plan

Before changing any code, show a short numbered list: each item as `path:line — reviewer's ask → your proposed action (class)`. Group by file. Keep it tight; this is a triage summary, not a transcript.

For a large or contentious batch, pause here for the user to confirm or reprioritize. For a small, clearly-actionable batch, you may proceed straight into Step 4 and report as you go.

## Step 4: Process the items

Work through the actionable items:

- Read the referenced file at the cited line before editing; the `diff_hunk`/line may be slightly off after later commits — verify against current code.
- Make focused edits that directly address each comment. Follow the surrounding code style and any repo `CLAUDE.md` conventions.
- For questions, write the answer as text; only edit code if the answer exposes a genuine problem.
- If a comment is wrong, out of scope, or you disagree, don't silently comply — flag it with your reasoning and let the user decide.
- Run the project's build/tests for anything non-trivial if a fast command exists.

Track what you did per item so Step 5's summary is accurate.

## Step 5: Report, and offer to reply / resolve / push

Summarize: for each item — **done** (with the file:line changed), **answered** (with the answer), **skipped** (with why), or **needs-decision**.

Replying, resolving threads, committing, and pushing are outward-facing — **confirm before doing any of them** unless the user already told you to. When the user asks, use:

```bash
# Reply to an inline thread (reply_to = the comment id from REVIEW_THREADS):
gh api "repos/<owner>/<name>/pulls/<pr>/comments/<reply_to>/replies" -f body="..."

# Resolve an inline thread (id = the thread node id from REVIEW_THREADS):
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id="<THREAD_ID>"

# Post a general PR comment:
gh pr comment <pr> --body "..."
```

When you commit fixes, reference the feedback (e.g. "address review comments on <file>") and let the user push unless they've said to push for them.
