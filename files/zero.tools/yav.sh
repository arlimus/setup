#!/bin/bash
set -e

url="$1"
test -z "$url" && echo "Usage: yav <youtube-url>" >&2 && exit 1

tmpfile=$(mktemp)
trap "rm -f '$tmpfile'" EXIT

yt-dlp \
  --no-playlist \
  -f bestvideo+bestaudio \
  --audio-quality 0 \
  -i \
  --merge-output-format mkv \
  --print-to-file "after_move:%(filepath)s" "$tmpfile" \
  "$url"

while IFS= read -r filepath; do
  [ -z "$filepath" ] && continue
  urlfile="${filepath%.*}.url"
  printf '%s\n' "$url" > "$urlfile"
  echo "→ wrote $urlfile"
done < "$tmpfile"
