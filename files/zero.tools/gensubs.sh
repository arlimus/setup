#!/bin/bash
set -e

# Generate .srt subtitles next to each input file with faster-whisper
# (whisper-ctranslate2) on the GPU.
#
# ctranslate2's wheels are built against CUDA 12, but the system cuda package
# is newer, so libcublas.so.12 isn't found. Pull the CUDA 12 cuBLAS/cuDNN
# wheels via uv and put them on LD_LIBRARY_PATH instead.

model="${GENSUBS_MODEL:-large-v3}"

lang=""
files=()
passthru=()
while [ $# -gt 0 ]; do
  case "$1" in
    --lang) lang="$2"; shift ;;
    --lang=*) lang="${1#*=}" ;;
    --) shift; passthru=("$@"); break ;;
    -*) echo "gensubs: unknown option $1 (pass whisper-ctranslate2 args after --)" >&2; exit 1 ;;
    *) files+=("$1") ;;
  esac
  shift
done

test ${#files[@]} -eq 0 && echo "Usage: gensubs [--lang LANG] <file>... [-- whisper-ctranslate2 args...]  (no --lang = auto-detect)" >&2 && exit 1

lang_args=()
test -n "$lang" && lang_args=(--language "$lang")

libs=$(uv run --quiet --python 3.12 --no-project --with nvidia-cublas-cu12 --with nvidia-cudnn-cu12 \
  python -c 'import nvidia.cublas.lib as a, nvidia.cudnn.lib as b; print(a.__path__[0]+":"+b.__path__[0])')

for f in "${files[@]}"; do
  LD_LIBRARY_PATH="$libs${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" uvx --python 3.12 whisper-ctranslate2 "$f" \
    --model "$model" "${lang_args[@]}" \
    --device cuda --compute_type float16 \
    --vad_filter True \
    --output_format srt --output_dir "$(dirname "$f")" \
    "${passthru[@]}"
done
