#!/bin/sh
set -eu

runtime_cache="${OCR_CACHE_HOME:-/app/.paddlex-cache}"
baked_cache="${OCR_BAKED_CACHE_HOME:-/opt/paddlex-cache}"

if [ -d "$baked_cache/official_models" ]; then
  mkdir -p "$runtime_cache"
  cp -a "$baked_cache/." "$runtime_cache/"
fi

exec "$@"
