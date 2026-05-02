---
name: youtube-summary
description: Summarize and analyze a YouTube video by extracting its transcript, description, chapters, and metadata via yt-dlp, then synthesizing a structured summary. Accepts a YouTube URL as the first argument. Use when the user asks to summarize, analyze, extract quotes from, or interact with a YouTube video.
allowed-tools: Bash(/home/zero/.claude/skills/youtube-summary/fetch.sh *), Read(//home/zero/.cache/claude-youtube-summary/**), Write(//home/zero/.cache/youtube-summaries/**), Read, Grep, Glob
argument-hint: "<youtube-url> [--terse|--quick|--detailed|--quotes|--claims|--with-comments|--refresh]"
---

# YouTube Summary & Analysis

Extract a YouTube video's transcript + description + chapters + metadata in **one** pre-authorized Bash call, then synthesize a structured summary and stay available for follow-up questions.

## Step 0: Parse arguments

User provided: `$ARGUMENTS`

Extract:
- **URL**: the first `http(s)://...` token, or a bare `youtu.be/...` / `youtube.com/...` / `youtube.com/shorts/...` token
- **Style flags** (mutually exclusive, last one wins) — these affect *output*, not the fetch:
  - `--terse` — single paragraph, no headers / bullets / sections (good for Shorts and short clips)
  - `--quick` — TL;DR + 3 bullets only
  - `--detailed` — chapter-by-chapter expansion
  - `--quotes` — verbatim quotes with timestamps
  - `--claims` — factual claims with timestamps and a confidence note
  - (default) — TL;DR, key points, optional notable quotes
- **Fetch-modifier flags** — passed through to `fetch.sh`:
  - `--with-comments` — also fetch top comments for community context
  - `--refresh` — ignore cache and re-fetch

**Auto-style for short content:** if no style flag was passed AND the video is ≤3 minutes (check Duration in the metadata block, or `/shorts/` in the URL), use `--terse` automatically. Long videos default to the full format.

If no URL is provided, ask for one and stop.

## Step 1: Fetch everything in one call

Run the wrapper exactly once. It handles cache, yt-dlp, jq metadata extraction, and transcript dedupe internally. Pass through only `--refresh` and `--with-comments`; ignore the style flags here.

```bash
/home/zero/.claude/skills/youtube-summary/fetch.sh "<URL>" [--refresh] [--with-comments]
```

**Important: invoke it bare.** Do not pipe through `head`, `tail`, `tee`, etc., and do not wrap in `bash -c` — those break the pre-authorized Bash pattern and will trigger a permission prompt.

The script writes structured output to stdout in this exact order:
- `### CACHE_DIR` — absolute path to the per-video cache
- `### METADATA` — Title, Uploader, Duration, Upload Date, Views, Likes, URL
- `### CHAPTERS` — `[Ns] title` lines, or `(no chapters)`
- `### DESCRIPTION` — full uploader description
- `### TOP_COMMENTS` — only if `--with-comments` was passed
- `### TRANSCRIPT_FILE` — absolute path to the cleaned `[mm:ss]` transcript, plus a line count. If captions are unavailable: `(no subtitles available — work from description + chapters only)`
- `### SUMMARY_PATH` — absolute path under `~/.cache/youtube-summaries/` where you must write the synthesized summary in Step 4. Format: `<sanitized-title>.<video-id>.md`

If the script exits non-zero (private / age-locked / region-blocked / deleted), report the error verbatim and stop.

## Step 2: Read the transcript

Take the path under `### TRANSCRIPT_FILE` and Read it. The transcript is already deduped (one `[mm:ss] line` per phrase). The cache directory is pre-authorized for reads, so this should not prompt.

If the transcript line says `(no subtitles available …)`, skip the Read and proceed using only metadata + chapters + description. Tell the user the summary is reduced fidelity for that reason.

## Step 3: Present the summary

Default format:

```
**<Title>**
*<Uploader> · <Duration> · <Upload Date> · <Views> views*
<URL>

**TL;DR**
2-3 sentences capturing the core thesis or content.

**Key points**
- 4-8 bullets with the most important takeaways
- Reference timestamps as [mm:ss] when a point ties to a specific moment
- Structure bullets around chapters when they exist

**Notable quotes** *(only if content warrants — skip for tutorials / how-tos)*
- "..." — [mm:ss]
```

Style-flag overrides:
- `--terse` — replace the full structure with:
  ```
  **<Title>** — *<Uploader> · <Duration>*
  <URL>

  <2-4 sentence paragraph capturing hook, point, payoff>
  ```
  No TL;DR header, no bullets, no quotes section. Add at most one extra line: `Claim: <text>`, a verbatim punchline in quotes, or `Note: <text>` for a transcription issue. If it's a sponsor read, low-effort meme, or pure music, say so in one sentence and stop.
- `--quick` — drop everything except TL;DR + 3 bullets
- `--detailed` — replace bullets with one paragraph per chapter; reference timestamps liberally
- `--quotes` — replace bullets with 5-10 verbatim quotes, each with [mm:ss] and a one-line gloss
- `--claims` — list factual claims as `[mm:ss] <claim> — <confidence: stated as fact / opinion / speculation / dubious>`. Flag any claim that contradicts well-known facts or is presented confidently without support.

If `--with-comments` was used, add a final **Community reaction** section with 2-4 themes from the top comments (corrections, counterpoints, additional context). Note pinned comments separately if the uploader added one — they often contain corrections or links the video itself doesn't mention.

## Step 4: Save the summary to disk

Use the `Write` tool to save the same summary you just shipped to the user to the path printed under `### SUMMARY_PATH`. The path is already sanitized and namespaced by video ID, so use it verbatim — do not rewrite or "improve" the filename. Overwrite without asking; re-runs (especially with a different style flag or `--refresh`) intentionally replace the prior summary.

Write the rendered markdown the user saw, not raw transcript text. Lead the file with the URL on its own line so the saved file is self-contained for later reference. Skip this step only if the summary failed to generate (e.g. private video, no captions and uploader description was empty).

## Step 5: Stay interactive

End with: *"Ask me anything about the video — specific moments, claims, opinions, or to expand a section."*

For follow-ups:
- **"What did they say about X?"** → grep the transcript file for X, quote the relevant span
- **"At what timestamp did they discuss Y?"** → grep + report timestamps
- **"Was their argument for Z sound?"** → quote the argument, then critique
- **"Compare to <other video / my notes>"** → load the other source, reason across both
- **"Pull all the book/tool/paper references"** → scan transcript and description for proper nouns and links

The cache persists across sessions, so re-reads are free.

## Cache management

- Transcript / metadata cache: `~/.cache/claude-youtube-summary/<video-id>/`
- Saved summaries: `~/.cache/youtube-summaries/<sanitized-title>.<video-id>.md`
- Force refresh a single video: pass `--refresh` (rebuilds metadata; the summary file gets overwritten on the next run regardless)
- Wipe everything: `rm -rf ~/.cache/claude-youtube-summary ~/.cache/youtube-summaries`

## Limitations to surface honestly

- **No audio transcription** — if YouTube has no captions, this skill cannot generate them. Recommend whisper externally.
- **Auto-sub accuracy** — auto-generated captions miss proper nouns, technical terms, accents. Flag uncertainty when quoting from auto-subs.
- **Long videos** — for 3hr+ podcasts the transcript may push context limits. Lead with chapter-level summary and let the user drill in.
- **Private / paywalled / age-restricted** — yt-dlp will fail without auth. Don't attempt cookie workarounds unless the user explicitly provides them.
