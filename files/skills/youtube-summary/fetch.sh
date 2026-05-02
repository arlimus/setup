#!/usr/bin/env bash
# Fetch and prepare a YouTube video for the youtube-summary Claude skill.
# Bundles yt-dlp + jq + dedupe-vtt.sh into a single command so the skill needs
# only one pre-authorized Bash invocation per video.
#
# Usage:
#   fetch.sh <url> [--refresh] [--with-comments]
#
# stdout: structured block — CACHE_DIR, METADATA, CHAPTERS, DESCRIPTION,
#         TOP_COMMENTS (if --with-comments), TRANSCRIPT_FILE, SUMMARY_PATH
# stderr: progress + errors

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_ROOT="$HOME/.cache/claude-youtube-summary"
SUMMARY_ROOT="$HOME/.cache/youtube-summaries"

# Make the title safe to use as a filename: drop control chars, collapse
# anything outside [A-Za-z0-9._-] into "_", trim leading/trailing "_.-",
# cap length, fall back to "untitled" if nothing usable remains.
sanitize_title() {
  local t
  t=$(LC_ALL=C printf '%s' "$1" \
        | tr -d '\000-\037\177' \
        | sed -E 's/[^A-Za-z0-9._-]+/_/g; s/_+/_/g; s/^[_.-]+//; s/[_.-]+$//' \
        | cut -c1-80 \
        | sed -E 's/[_.-]+$//')
  [ -n "$t" ] || t="untitled"
  printf '%s' "$t"
}

URL=""
REFRESH=0
COMMENTS=0
for arg in "$@"; do
  case "$arg" in
    --refresh)        REFRESH=1 ;;
    --with-comments)  COMMENTS=1 ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *)  URL="$arg" ;;
  esac
done

if [ -z "$URL" ]; then
  echo "usage: fetch.sh <url> [--refresh] [--with-comments]" >&2
  exit 2
fi

mkdir -p "$CACHE_ROOT"

VIDEO_ID=$(yt-dlp --print id --skip-download --no-warnings "$URL" 2>/dev/null) || {
  echo "Could not resolve video ID for: $URL" >&2
  exit 1
}

WORK_DIR="$CACHE_ROOT/$VIDEO_ID"
[ "$REFRESH" -eq 1 ] && rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

INFO="$WORK_DIR/$VIDEO_ID.info.json"

if [ ! -f "$INFO" ]; then
  echo "Fetching $URL ..." >&2
  EXTRA=()
  [ "$COMMENTS" -eq 1 ] && EXTRA+=(--get-comments --extractor-args "youtube:max_comments=50,all,0,0")
  yt-dlp \
    --skip-download \
    --write-info-json \
    --write-subs \
    --write-auto-subs \
    --sub-langs "en.*" \
    --sub-format "vtt" \
    --no-warnings \
    "${EXTRA[@]}" \
    -o "$WORK_DIR/%(id)s.%(ext)s" \
    "$URL" >&2
fi

# Pick best subtitle file: manual-only > auto-orig > whatever .en.vtt is left
RAW_VTT=""
if [ -f "$WORK_DIR/$VIDEO_ID.en.vtt" ] && [ ! -f "$WORK_DIR/$VIDEO_ID.en-orig.vtt" ]; then
  RAW_VTT="$WORK_DIR/$VIDEO_ID.en.vtt"
elif [ -f "$WORK_DIR/$VIDEO_ID.en-orig.vtt" ]; then
  RAW_VTT="$WORK_DIR/$VIDEO_ID.en-orig.vtt"
elif [ -f "$WORK_DIR/$VIDEO_ID.en.vtt" ]; then
  RAW_VTT="$WORK_DIR/$VIDEO_ID.en.vtt"
fi

CLEAN="$WORK_DIR/$VIDEO_ID.clean.txt"
if [ -n "$RAW_VTT" ] && [ ! -f "$CLEAN" ]; then
  "$SCRIPT_DIR/dedupe-vtt.sh" "$RAW_VTT" > "$CLEAN"
fi

echo "### CACHE_DIR"
echo "$WORK_DIR"
echo
echo "### METADATA"
jq -r '
  "Title:        \(.title)\n" +
  "Uploader:     \(.uploader // .channel)\n" +
  "Duration:     \(.duration_string)\n" +
  "Upload Date:  \(.upload_date)\n" +
  "Views:        \(.view_count)\n" +
  "Likes:        \(.like_count // "n/a")\n" +
  "URL:          \(.webpage_url)"
' "$INFO"
echo
echo "### CHAPTERS"
jq -r '
  if (.chapters // []) | length == 0 then "(no chapters)"
  else .chapters | map("[\(.start_time | tostring | split(".")[0])s] \(.title)") | join("\n")
  end
' "$INFO"
echo
echo "### DESCRIPTION"
jq -r '.description' "$INFO"
echo
if [ "$COMMENTS" -eq 1 ]; then
  echo "### TOP_COMMENTS"
  jq -r '
    .comments // []
    | sort_by(-(.like_count // 0))
    | .[0:10]
    | map("[\(.like_count // 0) likes] \(.author): \(.text | gsub("\n+"; " "))")
    | join("\n\n")
  ' "$INFO"
  echo
fi
echo "### TRANSCRIPT_FILE"
if [ -n "$RAW_VTT" ]; then
  echo "$CLEAN"
  echo "(lines: $(wc -l < "$CLEAN"))"
else
  echo "(no subtitles available — work from description + chapters only)"
fi
echo
echo "### SUMMARY_PATH"
mkdir -p "$SUMMARY_ROOT"
TITLE_RAW=$(jq -r '.title // ""' "$INFO")
SAFE_TITLE=$(sanitize_title "$TITLE_RAW")
echo "$SUMMARY_ROOT/$SAFE_TITLE.$VIDEO_ID.md"
