# setup

Tiny collection of setup helpers. Configures:

* git
* vim
* zsh
* vscode
* npm, go, ruby
* linux: i3, gtk, compton, packages


## Arch Linux

Requirements:
1. a regular user
2. sudo for this user (recommended: passwordless)
3. this git repo

Tiny bootstrap script **which must be run as root**: [arch.bootstrap.sh](arch.bootstrap.sh)

(run a test via `docker build --file arch.dockerfile . --rm -t arlimus/setup:latest`)

```
# set up the core OS
node setup/cli.js

# set up all packages including UI stuff and parallels tools
node setup/all.js
```


## Configuration

The following env variables may be used:

* `GIT_USER_NAME` for git username configuration; if no git user name is configured the script will interactively ask you for one. If a name has been set in your `.gitconfig` it will be used instead.
* `GIT_USER_EMAIL` same as `GIT_USER_NAME` just for email address