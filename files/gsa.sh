#!/bin/bash

if [ "$XDG_SESSION_TYPE" = "wayland" ] || [ -n "$WAYLAND_DISPLAY" ]; then
    grim -g "$(slurp)" ~/"Screenshots/$(date "+%Y.%m.%d-%H:%M:%S").png"
else
    #gnome-screenshot -a
    maim -u -s ~/"Screenshots/$(date "+%Y.%m.%d-%H:%M:%S").png"
fi
