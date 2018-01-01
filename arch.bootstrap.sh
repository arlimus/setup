#!/bin/bash
set -e
set -x
username=zero

id -u "$username" || useradd -m "$username"
pacman -Sy
command -v sudo || pacman -S sudo --noconfirm
sudo -l -U "$username" | grep "not allowed to run sudo" && echo "$username ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
command -v git || pacman -S git --noconfirm
rm -rf /tmp/setup && sudo -u "$username" git clone https://github.com/arlimus/setup /tmp/setup

set +x
GIT_USER_NAME="My Name" GIT_USER_EMAIL="my-e@mail.com" \
  sudo -E -u "$username" -- bash /tmp/setup/arch