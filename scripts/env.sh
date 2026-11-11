# Source this file before running npm, Gradle or electron-builder:
#
#   . scripts/env.sh
#
# It keeps every heavy cache (npm, Electron, electron-builder, Gradle) in one
# place outside the source tree, so the project folder stays small.
# Override the location with ATOMIC_ATLAS_CACHE.

export ATOMIC_ATLAS_CACHE="${ATOMIC_ATLAS_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/atomic-atlas}"
export npm_config_cache="$ATOMIC_ATLAS_CACHE/npm"
export ELECTRON_CACHE="$ATOMIC_ATLAS_CACHE/electron"
export electron_config_cache="$ATOMIC_ATLAS_CACHE/electron"
export ELECTRON_BUILDER_CACHE="$ATOMIC_ATLAS_CACHE/electron-builder"
export GRADLE_USER_HOME="$ATOMIC_ATLAS_CACHE/gradle"
export npm_config_update_notifier=false
export npm_config_fund=false
