#!/bin/bash

url="$1"                                                                                                                                                     
test -z "$url" && echo "need a youtube link" && exit 1                                                                                                       

f="$(youtube-dl --get-filename "$url")"                                                                                                                      
d="$(date +"%m-%d")"                                                                                                                                         

echo -e "Download \e[35m$url\e[0m to\n\e[36m$f\e[0m"
#read -s -n 1 key                                                                                                                                            
mkdir -p ~/4serv/"$d"                                                                                                                                        
cd ~/4serv/"$d"                                                                                                                                              
youtube-dl -f 18 "$url" 
