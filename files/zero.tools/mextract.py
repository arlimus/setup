#!/usr/bin/env python3
import sys
import subprocess
import json

files = sys.argv[1:]

def trackinfo2mkvextract(track, file):
    id = str(track["id"])
    codec = track["codec"]
    match track["type"]:
        case "video":
            return id+":"+file+"."+id+".mkv"
        case "audio":
            return id+":"+file+"."+id+".ogg"
        case "subtitles":
            if codec == "SubStationAlpha":
                return id+":"+file+"."+id+".ass"
            if codec == "SubRip/SRT":
                return id+":"+file+"."+id+".srt"
            if codec == "HDMV PGS":
                return id+":"+file+"."+id+".pgs"
            sys.exit("Unknown subtitles track codec: " + codec)
        case _:
            sys.exit("Unknown track type: " + track["type"])

for file in files:
    res = subprocess.run(["mkvmerge", "-J", file], capture_output=True, text=True) 
    if res.returncode != 0:
        sys.exit("EE: "+res.stderr)
    info = json.loads(res.stdout)

    tracks = list(map(lambda x: trackinfo2mkvextract(x, file), info["tracks"]))
    cli = ["mkvextract", file, "tracks"] + tracks
    print(" ".join(cli))
    res = subprocess.run(cli, capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit("failed to extract: "+res.stdout+" "+res.stderr)
    print("✓ tracks extracted from "+file)

