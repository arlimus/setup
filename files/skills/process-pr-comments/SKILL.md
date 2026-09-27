---
name: process-pr-comments
description: Pull the latest comments from a GitHub pull request and process them — fetch new reviews, inline code threads, and conversation comments, triage what is actionable, and address the feedback. Use when the user says "pull the latest comments from PR #NUM and process them" or asks to process/address the newest comments on a PR. The PR number is optional; if omitted, resolve it from conversation context or the current branch.
allowed-tools: Bash(/home/zero/.claude/skills/process-pr-comments/fetch.sh:*), Bash(/home/zero/.claude/skills/process-pr-comments/commit.sh:*), Bash(gh *), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git branch:*), Bash(git rev-parse:*), Read, Grep, Glob, Edit, Write, Task
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

Then, **before editing any file**, record the baseline of pre-existing uncommitted changes (again, invoke it bare):

```bash
/home/zero/.claude/skills/process-pr-comments/commit.sh begin
```

Files it lists were already dirty before you started. They are the user's work in progress: don't edit them unless a comment requires it, and never commit them (the script refuses). If a fix has to touch one, say so, and leave committing that file to the user.

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
| **Needs decision** | The fix carries an impactful decision (see below) | **Don't implement.** Present options + your recommendation and stop |

### What counts as "needs decision"

An item needs the user's call when addressing it would commit them to something beyond a local fix. For example:

- Public API, CLI, config, wire-format, or schema changes; anything that breaks callers or needs a migration
- Changes to user-visible behavior, defaults, or error semantics
- Security, auth, permissions, or data-handling changes
- Adding, removing, or upgrading dependencies
- Architectural or design-direction choices: new abstractions, moving responsibilities, picking between several valid approaches
- Removing functionality or tests, or widening scope beyond the PR
- You disagree with the reviewer, or the ask is ambiguous enough that you'd have to guess the intent
- Reviewers contradict each other

When unsure, treat it as needing a decision. Asking once costs less than having the user undo a commit.

Deprioritize `outdated=true` threads — the code they point at has moved. Confirm before treating one as still-relevant.

If nothing in the working set is newer than `LAST_COMMIT` and every thread is resolved, say so plainly — there is nothing new to process — and stop rather than inventing work.

## Step 3: Present the plan

Before changing any code, show a short numbered list: each item as `path:line — reviewer's ask → your proposed action (class)`. Group by file. Keep it tight; this is a triage summary, not a transcript.

**If any item is `needs decision`, stop here.** Don't edit anything yet. For each such item, give the options (2–3, with trade-offs) and your recommendation. List the clear items too, so the user can approve everything in one reply. Continue only after they answer.

Also pause for a large or contentious batch. If every item is clear and the batch is small, go straight into Step 4 and report as you go.

## Step 4: Process the items

Work through the actionable items:

- Read the referenced file at the cited line before editing; the `diff_hunk`/line may be slightly off after later commits — verify against current code.
- Make focused edits that directly address each comment. Follow the surrounding code style and any repo `CLAUDE.md` conventions.
- For questions, write the answer as text; only edit code if the answer exposes a genuine problem.
- If a comment is wrong, out of scope, or you disagree, don't silently comply — flag it with your reasoning and let the user decide.
- **If an impactful decision surfaces mid-work** (the fix turns out bigger than it looked, or it forces one of the choices listed above), stop right away. Don't commit. Report what you've changed so far and ask the user how to proceed.
- Track every file you edit. Only those files may go into the commit.
- Run the project's build/tests for anything non-trivial if a fast command exists.

Track what you did per item so Step 6's summary is accurate.

## Step 5: Commit the feedback changes

Commit once all actionable items are done. Skip committing if a decision is still open, the build/tests fail, or nothing changed. Use the wrapper; it's the only way this skill can commit (raw `git add`/`git commit` are denied):

```bash
/home/zero/.claude/skills/process-pr-comments/commit.sh commit -m "<short body>" -- <file> [<file>...]
```

- The title is always `🟢 reviewer feedback`, and the script sets it. Don't try to change it.
- `-m` is optional: at most 3 lines, 72 chars each. Say what changed in a few words (e.g. `handle nil config in loader; rename fooBar -> fooBaz`). No per-comment transcript.
- List **only** the files you edited while processing this feedback, each explicitly. No `.`, directories, or globs; the script rejects them. It also refuses files from the `begin` baseline, the default branch, and detached HEAD.
- Anything the user already staged is committed too — staging is their instruction to include it. Never unstage it, and never ask them to.
- If the script refuses, report its message verbatim and stop. Don't work around it.

Once the commit succeeds, **push right away, without asking**. Invoking this skill is the user's standing authorization to push its own feedback commits. Use the wrapper; raw `git push` is denied:

```bash
/home/zero/.claude/skills/process-pr-comments/commit.sh push
```

It pushes the current branch to its upstream under the same name, fast-forward only, and never forces. It refuses when the branch has no upstream, the remote has commits the branch lacks, or any unpushed commit isn't a `🟢 reviewer feedback` commit (so it can't publish the user's own unpushed work). If it refuses, report its message verbatim and stop.

## Step 6: Report, and offer to reply / resolve

Summarize: for each item — **done** (with the file:line changed), **answered** (with the answer), **skipped** (with why), or **needs-decision**. Include the commit hash and whether it was pushed.

Replying and resolving threads are outward-facing — **confirm before doing either** unless the user already told you to. Only reply "fixed" on a thread once the push has succeeded, so the reply points at code the reviewer can see.

For replies and resolving, when the user asks, use:

```bash
# Reply to an inline thread (reply_to = the comment id from REVIEW_THREADS):
gh api "repos/<owner>/<name>/pulls/<pr>/comments/<reply_to>/replies" -f body="..."

# Resolve an inline thread (id = the thread node id from REVIEW_THREADS):
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id="<THREAD_ID>"

# Post a general PR comment:
gh pr comment <pr> --body "..."
```
