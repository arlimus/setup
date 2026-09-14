#!/bin/bash
set -e

# Browser to pull cookies from. Set YAV_COOKIES_FROM= (empty) to disable.
cookies_from="${YAV_COOKIES_FROM-firefox}"

# With cookies YouTube only hands out combined HLS streams (one per audio
# language), so bestvideo+bestaudio no longer resolves on its own. The /b
# fallback catches that; yt-dlp's default sort starts with `lang`, which
# prefers the track marked "(original)", then picks its best resolution.
format="${YAV_FORMAT:-bestvideo+bestaudio/best}"

list_formats=0
url=""
passthru=()
for arg in "$@"; do
  case "$arg" in
    -F|--list-formats) list_formats=1 ;;
    --no-cookies) cookies_from="" ;;
    --cookies-from=*) cookies_from="${arg#*=}" ;;
    -*) passthru+=("$arg") ;;
    *) if [ -z "$url" ]; then url="$arg"; else passthru+=("$arg"); fi ;;
  esac
done

test -z "$url" && echo "Usage: yav [-F] [--no-cookies] [--cookies-from=BROWSER] <youtube-url> [yt-dlp args...]" >&2 && exit 1

cookie_args=()
test -n "$cookies_from" && cookie_args=(--cookies-from-browser "$cookies_from")

if [ "$list_formats" -eq 1 ]; then
  # Only the "(original)" rows matter: the others are dubbed audio tracks.
  yt-dlp "${cookie_args[@]}" "${passthru[@]}" --no-playlist -F "$url" |
    grep -E '^ID |^-{3} |\(original\)'
  exit 0
fi

tmpfile=$(mktemp)
trap "rm -f '$tmpfile'" EXIT

yt-dlp \
  "${cookie_args[@]}" \
  --no-playlist \
  -f "$format" \
  --audio-quality 0 \
  -i \
  --merge-output-format mkv \
  --print-to-file "after_move:%(filepath)s" "$tmpfile" \
  "${passthru[@]}" \
  "$url"

while IFS= read -r filepath; do
  [ -z "$filepath" ] && continue
  urlfile="${filepath%.*}.url"
  printf '%s\n' "$url" > "$urlfile"
  echo "→ wrote $urlfile"
done < "$tmpfile"
