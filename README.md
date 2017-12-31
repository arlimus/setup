# setup

Tiny collection of setup helpers. Configures:

* git
* vim
* zsh
* vscode
* npm, go, ruby
* linux: i3, gtk, compton, packages


## Arch Linux

Requirements

1. Set up a regular user:

    ```bash
    useradd -m USERNAME
    ```

2. Install and setup sudo:

    ```bash
    pacman -S sudo
    visudo
    ```

    Make sure to add a line with your username at the end:

    ```bash
    USERNAME ALL=(ALL) NOPASSWD: ALL
    ```

3. Log into the regular user:

    ```bash
    su - USERNAME
    ```

4. Get this repo via git:

    ```bash
    sudo pacman -S git
    git clone https://github.com/arlimus/setup
    cd setup
    ```

You can now run this setup:

```bash
./arch
```
