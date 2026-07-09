# Use Node.js 22 Active LTS base image
FROM node:22-slim

# Install Claude Code CLI globally via npm
RUN npm install -g @anthropic-ai/claude-code

# Run as (container) root -- on purpose.
#
# This image is launched under *rootless* Docker, where the container's root is
# remapped to the unprivileged host user that started it. The bind-mounted
# /workspace (host repo) therefore appears owned by root *inside* the container,
# and root is the only UID that can read/write it. Files created land back on
# the host owned by that same host user.
#
# A dedicated non-root user (the old `USER claude`, UID 1000) is the wrong call
# here: rootless maps UID 1000 to a subordinate UID (host 100999), so it gets
# "permission denied" on /workspace, and anything it did create would be
# orphaned to a subuid the host user can't touch.
#
# IS_SANDBOX lets `claude --dangerously-skip-permissions` run despite being
# (container) root -- safe because this is a throwaway, workspace-scoped sandbox.
ENV IS_SANDBOX=1
ENV HOME=/home/claude
RUN mkdir -p /home/claude
WORKDIR /workspace

# Execute claude by default
CMD ["claude"]
