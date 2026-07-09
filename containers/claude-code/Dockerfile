# Use Node.js 22 Active LTS base image
FROM node:22-slim

# git + GitHub CLI: claude leans on both heavily when working in repos. git is a
# plain apt package; gh isn't in Debian's default repos, so pull it from
# GitHub's official apt repository (keyring + signed-by source).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git \
    && mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
         -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
         > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Read-only git guardrail: shadow the real git (/usr/bin/git) with a wrapper on
# /usr/local/bin (which precedes /usr/bin on PATH). claude may inspect the repo
# but `git add`/`commit`/`push` are refused -- the sandbox never mutates or
# publishes history. See git-guard for the passthrough logic.
COPY git-guard /usr/local/bin/git
RUN chmod +x /usr/local/bin/git

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
