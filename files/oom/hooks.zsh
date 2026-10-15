# oomrun hooks: route memory-heavy interactive commands into their OOM tier.
# Only affects what you type; make/go invoked by other tools are untouched.
(( $+commands[oomrun] )) || return 0

# go builds: protected, killed last. `go run` is usually a server, keep as is.
go() {
  case "$1" in
    build|test|install|generate|vet) oomrun build go "$@" ;;
    *) command go "$@" ;;
  esac
}

# dev servers (`make serve`, `make serve/local`, ...): killed before builds.
make() {
  local a
  for a in "$@"; do
    if [[ $a == serve || $a == serve/* ]]; then
      oomrun app make "$@"
      return
    fi
  done
  command make "$@"
}
