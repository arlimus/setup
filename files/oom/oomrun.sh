#!/bin/sh
# oomrun: launch a command in a memory tier so that, under memory pressure,
# things get killed in the right order: browser tabs first, then apps and dev
# servers, builds last. sway's session scope is never a candidate.
#
#   oomrun browser firefox         capped slice: tabs are OOM-killed inside it,
#                                  the rest of the system never notices
#   oomrun app make serve          oom_score_adj 500: killed before builds
#   oomrun build go build ./...    protected (MemoryLow, oomd avoid): last
#   oomrun auto <cmd>              browser for known browsers, else app (rofi)
#
# Each launch becomes its own transient scope (oomrun-<tier>-<cmd>-<pid>.scope)
# under ~/.config/systemd/user/oomrun-<tier>.slice, so systemd-oomd kills just
# that one command and `journalctl -u systemd-oomd` names what it killed.
set -e

usage() {
  echo "usage: oomrun <browser|app|build|auto> <cmd> [args...]" >&2
  exit 2
}
[ $# -ge 2 ] || usage
tier=$1
shift

if [ "$tier" = auto ]; then
  case "$(basename "$1")" in
    firefox*|chromium*|chrome*|google-chrome*) tier=browser ;;
    *) tier=app ;;
  esac
fi

# OOMPolicy=continue on the browser: a kernel OOM kill inside its capped slice
# takes out one tab process; the default policy would then stop all of Firefox.
case "$tier" in
  browser) adj=0;   pref=omit;  policy=continue ;;
  app)     adj=500; pref=none;  policy=stop ;;
  build)   adj=0;   pref=avoid; policy=stop ;;
  *) usage ;;
esac

name=$(basename "$1" | tr -c 'a-zA-Z0-9_.\n' '_')
# --scope keeps the command in the foreground of this terminal (tty, signals,
# cwd, env all unchanged); it is only moved into its own cgroup.
exec systemd-run --user --scope --quiet --collect \
  --unit="oomrun-$tier-$name-$$" \
  --slice="oomrun-$tier.slice" \
  -p ManagedOOMPreference="$pref" \
  -p OOMPolicy="$policy" \
  -- choom -n "$adj" -- "$@"
