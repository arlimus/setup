#!/bin/bash

url="$1"                                                                                                                                                     
test -z "$url" && echo "need a youtube link" && exit 1                                                                                                       

f="$(yt-dlp --get-filename "$url")"                                                                                                                      
d="$(date +"%m-%d")"                                                                                                                                         

echo -e "Download \e[35m$url\e[0m to\n\e[36m$f\e[0m"                                                                                                            
#read -s -n 1 key                                                                                                                                            
mkdir -p ~/4serv/"$d"                                                                                                                                        
cd ~/4serv/"$d"                                                                                                                                              

FORMATS="$(yt-dlp -F "$url")"
VCODEC="$(echo "$FORMATS" | grep -o "^137")"
test -z "$VCODEC" && echo -e "ERR unknown formats...\n${FORMATS}" && exit 1
echo yt-dlp -f $VCODEC+139 "$url" 
yt-dlp -f $VCODEC+139 "$url" 
