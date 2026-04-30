---
name: youtube-summary
description: Summarize and analyze a YouTube video by extracting its transcript, description, chapters, and metadata via yt-dlp, then synthesizing a structured summary. Accepts a YouTube URL as the first argument. Use when the user asks to summarize, analyze, extract quotes from, or interact with a YouTube video.
allowed-tools: Bash(yt-dlp *), Bash(mkdir *), Bash(ls *), Bash(jq *), Bash(rm *), Bash(test *), Bash(grep *), Bash(/home/zero/.claude/skills/youtube-summary/dedupe-vtt.sh *), Read(//home/zero/.cache/claude-youtube-summary/**), Read, Grep, Glob
argument-hint: "<youtube-url> [--quick|--detailed|--quotes|--claims|--with-comments|--refresh]"
---

# YouTube Summary & Analysis

Pull a YouTube video's transcript, description, chapters, and metadata through `yt-dlp`, synthesize a structured summary, and stay available for follow-up questions.

## Step 0: Parse arguments

User provided: `$ARGUMENTS`

Extract:
- **URL**: the first `http(s)://...` token, or a bare `youtu.be/...` / `youtube.com/...` token
- **Style flags** (mutually exclusive, pick the last one if multiple):
  - `--quick` — TL;DR + 3 bullets only
  - `--detailed` — chapter-by-chapter expansion
  - `--quotes` — verbatim quotes with timestamps
  - `--claims` — factual claims with timestamps and a confidence note
  - (default) — TL;DR, key points, optional notable quotes
- **Modifier flags**:
  - `--with-comments` — also fetch top comments for community context
  - `--refresh` — ignore cache and re-fetch

If no URL provided, ask the user for one and stop.

## Step 1: Set up cache

```bash
CACHE_ROOT="$HOME/.cache/claude-youtube-summary"
mkdir -p "$CACHE_ROOT"

VIDEO_ID=$(yt-dlp --print id --skip-download --no-warnings "$URL" 2>/dev/null)
test -n "$VIDEO_ID" || { echo "Could not resolve video ID"; exit 1; }

WORK_DIR="$CACHE_ROOT/$VIDEO_ID"
mkdir -p "$WORK_DIR"
```

If `--refresh` was passed, run `rm -rf "$WORK_DIR" && mkdir -p "$WORK_DIR"` first.

If `$WORK_DIR` already contains an `*.info.json` and at least one `*.vtt`, skip Step 2 (cache hit).

## Step 2: Fetch transcript, description, metadata

One yt-dlp invocation gets everything:

```bash
yt-dlp \
  --skip-download \
  --write-info-json \
  --write-subs \
  --write-auto-subs \
  --sub-langs "en.*" \
  --sub-format "vtt" \
  --no-warnings \
  -o "$WORK_DIR/%(id)s.%(ext)s" \
  "$URL"
```

If `--with-comments` was passed, add `--get-comments --extractor-args "youtube:max_comments=50,all,0,0"` to limit comment volume.

If yt-dlp fails (private, age-locked, region-blocked, deleted), report the error verbatim and stop. Do not retry.

## Step 3: Inspect what was fetched

```bash
ls "$WORK_DIR"
```

Expect some subset of:
- `<ID>.info.json` — title, uploader, duration, view_count, upload_date, chapters[], description, tags, comments (if requested)
- `<ID>.en.vtt` — manual English subs (preferred when present)
- `<ID>.en-orig.vtt` / `<ID>.en.vtt` — auto-generated subs (fallback)

## Step 4: Extract structured metadata

Use `jq` to pull only the fields you need — info.json can be large:

```bash
INFO="$WORK_DIR/$VIDEO_ID.info.json"
jq -r '{
  title, uploader: (.uploader // .channel),
  duration_string, view_count, like_count,
  upload_date, webpage_url,
  chapters: (.chapters // []),
  description
}' "$INFO"
```

For comments (if fetched):
```bash
jq -r '.comments // [] | sort_by(-.like_count) | .[0:10] | .[] | "[\(.like_count // 0) likes] \(.author): \(.text)"' "$INFO"
```

## Step 5: Dedupe and read the transcript

Pick the best raw subtitle file:
1. Prefer manual subs (`<ID>.en.vtt` when no `-orig` / `-auto` variant alongside it)
2. Fall back to auto-generated (`<ID>.en-orig.vtt` or whatever yt-dlp wrote)
3. If multiple language variants, prefer plain `en` over regional variants

**Always run the dedupe script before reading.** Auto-generated VTT has a rolling-window format where each phrase appears 2-3 times across overlapping cues plus inline `<timestamp>` tags — reading the raw file wastes context (a 7-min video produces ~33k tokens of mostly duplication). The script collapses it to one `[mm:ss] text` line per phrase. It is safe to run on manual subs too (effectively a no-op there).

```bash
SCRIPT="/home/zero/.claude/skills/youtube-summary/dedupe-vtt.sh"
RAW_VTT="$WORK_DIR/$VIDEO_ID.en-orig.vtt"   # or .en.vtt for manual subs
CLEAN="$WORK_DIR/$VIDEO_ID.clean.txt"
test -f "$CLEAN" || "$SCRIPT" "$RAW_VTT" > "$CLEAN"
wc -l "$CLEAN"
```

Then read `$CLEAN` with the Read tool. The cleaned file is cached, so subsequent runs skip the dedupe step.

If no subtitle file exists at all (live stream in progress, music video with subs disabled, captions removed), say so explicitly and offer to:
- Work from description + chapters + comments only (proceed with reduced fidelity)
- Suggest the user run `yt-dlp -x --audio-format mp3 <URL>` then transcribe with whisper externally — note this skill does not do audio transcription itself

## Step 6: Present the summary

Default format:

```
**<Title>**
*<Uploader> · <Duration> · <Upload Date> · <View Count> views*
<webpage_url>

**TL;DR**
2-3 sentences capturing the core thesis or content.

**Key points**
- 4-8 bullets with the most important takeaways
- Reference timestamps as [mm:ss] when a point ties to a specific moment
- If the video has chapters, structure bullets around them

**Notable quotes** *(only if content warrants — skip for tutorials / how-tos)*
- "..." — [mm:ss]
```

Style flag overrides:
- `--quick` — drop everything except TL;DR + 3 bullets
- `--detailed` — replace bullets with one paragraph per chapter; reference timestamps liberally
- `--quotes` — replace bullets with 5-10 verbatim quotes, each with [mm:ss] and a one-line gloss
- `--claims` — list factual claims as `[mm:ss] <claim> — <confidence: stated as fact / opinion / speculation / dubious>`. Flag any claim that contradicts well-known facts or is presented confidently without support.

If `--with-comments` was used, add a final **Community reaction** section with 2-4 themes from top comments (corrections, counterpoints, additional context). Note pinned comments separately if the uploader added one — they often contain corrections or links the video itself doesn't mention.

## Step 7: Stay interactive

End the response with: "Ask me anything about the video — specific moments, claims, opinions, or to expand a section."

For follow-ups:
- **"What did they say about X?"** → grep the VTT for X, quote the relevant span
- **"At what timestamp did they discuss Y?"** → grep + report timestamps
- **"Was their argument for Z sound?"** → quote the argument, then critique
- **"Compare to <other video / my notes>"** → load the other source, reason across both
- **"Pull all the book/tool/paper references"** → scan transcript and description for proper nouns and links

The cache persists across sessions, so re-reads are free.

## Cache management

- Cache lives at `~/.cache/claude-youtube-summary/<video-id>/`
- To force refresh a single video: pass `--refresh`
- To wipe all cached videos: `rm -rf ~/.cache/claude-youtube-summary`

## Limitations to surface honestly

- **No audio transcription** — if YouTube has no captions (manual or auto), this skill cannot generate them. Recommend whisper externally.
- **Auto-sub accuracy** — auto-generated captions miss proper nouns, technical terms, and accents. Flag uncertainty when quoting from auto-subs.
- **Long videos** — for 3hr+ podcasts, the transcript may push context limits. Lead with chapter-level summary; let the user drill into specific chapters for detail.
- **Private / paywalled / age-restricted** — yt-dlp will fail without auth. Do not attempt cookie workarounds unless the user explicitly provides them.
