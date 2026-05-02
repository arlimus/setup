alias v="mpv -vo x11 "
alias b="bundle exec"
alias ya="yt-dlp --no-playlist -f bestaudio --audio-quality 0 -i -x --extract-audio"
alias yav="yt-dlp --no-playlist -f bestvideo+bestaudio --audio-quality 0 -i --merge-output-format mkv"
alias yavs="yt-dlp --no-playlist --sub-lang en --write-auto-sub --embed-sub "
alias yapl="yt-dlp -f bestaudio --audio-quality 0 -i -x --extract-audio"
alias yavpl="yt-dlp -f bestvideo+bestaudio --audio-quality 0 -i --merge-output-format mkv"
alias yt="yt-dlp -f 18 -i"
export GOPATH=/pub/go
PATH=/pub/go/bin:$PATH
export $(gnome-keyring-daemon -s)

alias em="echo \" 🎉 🛑 🐛 💫 🍏 ➖ 💩 ⭐ 🌟 🐎 \n 🌌 🌙 🎨 🎫 🦅 📦 🐳 🚀 🛸 🌠 \n 👍 👎 🥳 🤬 🤪 🥵 🥶 🤯 🤘 🤞 \n 📯 🌊 🎆 🎇 🔥 💎\""

alias ya="yt-dlp -f bestaudio --audio-quality 0 -i -x --extract-audio"
alias yav="yt-dlp -f bestvideo+bestaudio --audio-quality 0 -i --merge-output-format mkv"
alias y="yay --color auto"
ylater() {
  url="$1"
  test -z "$url" && echo "need a youtube link" && exit 1
  f="$(yt-dlp --get-filename "$url")"
  d="$(date +"%m-%d")"
  echo "Download \e[35m$url\e[0m to\n\e[36m$f\e[0m"
  #read -s -n 1 key
  mkdir -p ~/4serv/"$d"
  cd ~/4serv/"$d"
  yt-dlp -f 18 "$url"
  #echo "$url" > "$f".url
}

ylaterw() {
  last="$(xclip -selection clipboard -o)"
  while true; do
    cur="$(xclip -selection clipboard -o)"
    sleep 0.3

    if test "$last" = "$cur"; then
      continue
    fi

    last="$cur"

    if test "${last:0:32}" != "https://www.youtube.com/watch?v="; then
      continue
    fi

    echo "capture $last"
    ylater "$last" &
  done
}

v2a() { ffmpeg -i "$1" -vn -acodec libvorbis -q:a 6 "$1".ogg }
v2mp4() { ffmpeg -i "$1" -c:v libx264 -c:a copy "$1".mp4 }

alias resetmouse="sudo modprobe -r psmouse && sudo modprobe psmouse proto=imps"
alias findlarge="find . -type f  -exec du -h {} + | sort -h"

