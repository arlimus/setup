#!/bin/bash
# Run Claude Code against the current directory inside a throwaway container.
#
# Under rootless Docker the container runs as (container) root, which is
# remapped to *you* -- the unprivileged host user. That is what makes the
# bind-mounted /workspace writable: host-owned files show up as root inside the
# userns, so only root can touch them, and files created come back owned by you.
# The image sets IS_SANDBOX=1 so claude accepts --dangerously-skip-permissions
# while (container) root. See containers/claude-code/Dockerfile for the details.
docker run -it --rm \
  -v "$HOME/.claude.json:/home/claude/.claude.json:ro" \
  -v "$HOME/.claude:/home/claude/.claude:ro" \
  -v "$(pwd):/workspace" \
  -w /workspace \
  claude-code:latest claude --dangerously-skip-permissions
