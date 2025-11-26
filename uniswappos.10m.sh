#!/bin/bash
# xbar plugin wrapper: runs the Node script

# Make sure Node is on PATH for xbar
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

DIR="$(cd "$(dirname "$0")" && pwd)"
node "$DIR/uni/uniswappos.js"
