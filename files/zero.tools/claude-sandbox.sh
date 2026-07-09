#!/bin/bash
# Run Claude Code against the current directory inside a throwaway container.
#
# Rootless-Docker note: the container runs as (container) root, which is
# remapped to *you* -- the unprivileged host user. That is what makes the
# bind-mounted /workspace writable (host-owned files appear as root inside the
# userns) and what makes files created inside come back owned by you. The image
# sets IS_SANDBOX=1 so claude accepts --dangerously-skip-permissions while
# (container) root. See containers/claude-code/Dockerfile for the details.
#
# Config handling: claude mutates ~/.claude.json and ~/.claude/** as it runs.
# Mounting the host copies read-only breaks those writes; read-write lets the
# sandbox scribble on your real config. So we snapshot them into a per-run
# scratch dir and bind-mount that instead -- the host copies stay pristine and
# every run gets a fresh, disposable config seeded from them.
set -u

scratch="$(mktemp -d "${TMPDIR:-/tmp}/claude-sandbox.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

# ~/.claude.json holds the main config (and, on some setups, credentials).
[ -f "$HOME/.claude.json" ] && cp -a "$HOME/.claude.json" "$scratch/.claude.json"

# Seed ~/.claude but skip bulky session history and host-local runtime state.
# The transcripts alone (projects/, file-history/) are ~340M, and /tmp is tmpfs
# here, so copying them would eat RAM every run. Skipping them also keeps your
# conversation history -- and stale daemon locks -- out of the sandbox. Auth
# (.credentials.json), settings, plugins, skills and hooks are all kept.
skip=(
  projects file-history shell-snapshots backups paste-cache cache debug
  daemon sessions session-env jobs tasks plans history.jsonl .last-cleanup
  daemon.lock daemon.log daemon.status.json
)
is_skipped() { local n=$1 s; for s in "${skip[@]}"; do [ "$s" = "$n" ] && return 0; done; return 1; }

mkdir -p "$scratch/.claude"
if [ -d "$HOME/.claude" ]; then
  shopt -s dotglob nullglob
  for src in "$HOME/.claude"/*; do
    name="${src##*/}"
    is_skipped "$name" && continue
    cp -a "$src" "$scratch/.claude/"
  done
  shopt -u dotglob nullglob
fi

# Only mount each source we actually have -- otherwise Docker would create an
# empty *directory* at the mount path (e.g. turning .claude.json into a dir),
# which claude would choke on.
config_mounts=( -v "$scratch/.claude:/home/claude/.claude" )
[ -f "$scratch/.claude.json" ] && config_mounts+=( -v "$scratch/.claude.json:/home/claude/.claude.json" )

# git identity (~/.gitconfig) and GitHub CLI auth (~/.config/gh): git is
# read-only in here (the image blocks add/commit/push -- see git-guard), so the
# gitconfig is just for inspecting history, and gh for looking things up. Both
# only ever *read* these files, so mount them read-only straight from the host:
# no token copied into the scratch dir, and the sandbox can't mutate your real
# git/gh config either.
[ -f "$HOME/.gitconfig" ] && config_mounts+=( -v "$HOME/.gitconfig:/home/claude/.gitconfig:ro" )
[ -d "$HOME/.config/gh" ] && config_mounts+=( -v "$HOME/.config/gh:/home/claude/.config/gh:ro" )

docker run -it --rm \
  "${config_mounts[@]}" \
  -v "$(pwd):/workspace" \
  -w /workspace \
  claude-code:latest claude --dangerously-skip-permissions
