#!/bin/sh
# Runs a throwaway TypeScript file against the project sources: scripts/probe.sh file.ts
set -e
out="${TMPDIR:-/tmp}/atomic-atlas-probe-$$.mjs"
"$(dirname "$0")/../node_modules/.bin/esbuild" "$1" --bundle --platform=node --format=esm --log-level=warning --loader:.json=json --outfile="$out"
node "$out"
rm -f "$out"
