#!/bin/bash

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
