FROM base/archlinux:latest

LABEL maintainer="dominik.richter@gmail.com"

RUN pacman -Sy --noconfirm archlinux-keyring
RUN pacman -Syyu --noconfirm
RUN pacman -S --noconfirm \
    i3status \
    i3-wm \
    nodejs \
    ttf-dejavu \
    xfce4-terminal \
    yarn

ADD . / /install/
RUN cd /install && yarn && node js/cli.js

RUN export DISPLAY=1.2.3.4:0
RUN useradd -m zero
WORKDIR /home/zero

