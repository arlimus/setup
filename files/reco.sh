#!/bin/bash

# kill any running recordings
pkill -f "ffmpeg -f x11grab"

# TODO: not sure why this is not working consistently in i3 anymore
# xdotool behave_screen_edge top-right exec sh -c 'pkill -f "ffmpeg -f x11grab"' &

mkdir -p ~/recordings
dst=~/recordings/"$(date "+%Y.%m.%d-%H.%M.%S").mp4"

slop=$(slop -o -f "%x %y %w %h %g %i")
read -r X Y W H G ID < <(echo $slop)
#ffmpeg -f x11grab -s "$W"x"$H" -i :0.0+$X,$Y -f alsa -i pulse ~/myfile.webm
ffmpeg -f x11grab -s "$W"x"$H" -i :0.0+$X,$Y -framerate 25 $dst

# TODO: not sure why this is not working consistently in i3 anymore
# pkill -f "xdotool behave_screen_edge"

echo "Saved to $dst"

