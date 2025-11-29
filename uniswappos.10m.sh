#!/bin/bash
# xbar plugin wrapper: runs the Node script

# Make sure Node is on PATH for xbar
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

DIR="$(cd "$(dirname "$0")" && pwd)"
CACHE="$DIR/uni/uniswappos.cache"
LOCKDIR="$DIR/uni/.uniswappos.lock"
CACHE_TTL=600 # seconds; keep the last good output around for ~10m

print_cache() {
  [ -f "$CACHE" ] && cat "$CACHE"
}

start_refresh() {
  mkdir "$LOCKDIR" 2>/dev/null || return
  (
    node "$DIR/uni/install.js" --auto >/dev/null 2>&1
    tmp="$CACHE.tmp"
    node "$DIR/uni/uniswappos.js" > "$tmp" 2>&1
    mv "$tmp" "$CACHE"
    rmdir "$LOCKDIR"
  ) &
}

now=$(date +%s)
if [ -f "$CACHE" ]; then
  mtime=$(stat -f %m "$CACHE" 2>/dev/null || echo 0)
  age=$((now - mtime))
else
  age=$((CACHE_TTL + 1))
fi

# Always kick off a refresh if cache is stale/missing and no refresh is running
if [ "$age" -gt "$CACHE_TTL" ] && [ ! -d "$LOCKDIR" ]; then
  start_refresh
fi

if [ -f "$CACHE" ]; then
  print_cache
  if [ "$age" -gt "$CACHE_TTL" ]; then
    echo "---"
    echo "Refreshing… (last update ${age}s ago)"
  fi
else
  echo "UNI $: loading…"
  echo "---"
  echo "Refreshing Uniswap positions…"
fi
