# Usage:  source ./source.sh
# Loads nvm and switches the current shell to the Node version pinned in .nvmrc.
# Only affects the shell that sources it — /usr/bin/node is untouched.

if [ -z "${BASH_VERSION-}${ZSH_VERSION-}" ]; then
  echo "source.sh must be sourced (e.g. 'source ./source.sh'), not executed." >&2
  return 1 2>/dev/null || exit 1
fi

if [ -s /usr/share/nvm/init-nvm.sh ]; then
  . /usr/share/nvm/init-nvm.sh
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
else
  echo "nvm not found (looked in /usr/share/nvm and ~/.nvm)" >&2
  return 1
fi

nvm install
nvm use

echo "node: $(node --version)  pnpm: $(pnpm --version 2>/dev/null || echo 'not installed')"
