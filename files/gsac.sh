#!/bin/bash

# Note: 2022-12-25, this method of keeping it all in-memory didn't work
# on current versions of Arch Linux. The file-based approach continues to
# work.
# maim -s | xclip -selection clipboard -t image/png

maim -s | convert - /tmp/gsac.png
xclip -selection clipboard -t image/png -i /tmp/gsac.png
