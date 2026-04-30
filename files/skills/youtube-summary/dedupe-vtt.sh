#!/usr/bin/env bash
# Dedupe a YouTube auto-caption VTT into a clean [mm:ss] transcript.
# Auto-captions use a rolling-window format where each phrase appears 2-3 times
# across overlapping cues, plus inline <timestamp> tags inside cue text.
# This strips both, leaving one line per phrase prefixed with its start time.
#
# Manual subs are not rolling-window, but the script is a safe no-op on them.
#
# Usage:
#   dedupe-vtt.sh <input.vtt>           # output to stdout
#   dedupe-vtt.sh < input.vtt           # read from stdin
#   dedupe-vtt.sh foo.vtt > foo.txt     # redirect to file

set -euo pipefail

awk '
/-->/ {
  split($1, t, ":")
  split(t[3], s, ".")
  total = t[1]*3600 + t[2]*60 + int(s[1])
  ts = sprintf("[%d:%02d]", int(total/60), total%60)
  in_cue = 1
  next
}
/^$/ { in_cue = 0; next }
in_cue {
  line = $0
  gsub(/<[^>]+>/, "", line)             # strip inline <00:00:00.480> tags
  gsub(/^[ \t]+|[ \t]+$/, "", line)     # trim whitespace
  if (line == "" || line == prev) next  # drop empty + consecutive duplicate
  prev = line
  print ts, line
}
' "${1:-/dev/stdin}"
