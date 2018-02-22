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
1. install [Arch Linux](https://wiki.archlinux.org/index.php/installation_guide)
2. a regular user
3. sudo for this user (recommended: passwordless)
4. this git repo

Tiny bootstrap script **which must be run as root**: [arch.bootstrap.sh](arch.bootstrap.sh)

```
$ cd setup
$ sudo ./arch
$ sudo systemctl enable lightdm
$ sudo reboot
```
### Testing 

run a test via `docker build --file arch.dockerfile . --rm -t arlimus/setup:latest`

## Configuration

The following env variables may be used:

* `GIT_USER_NAME` for git username configuration; if no git user name is configured the script will interactively ask you for one. If a name has been set in your `.gitconfig` it will be used instead.
* `GIT_USER_EMAIL` same as `GIT_USER_NAME` just for email address