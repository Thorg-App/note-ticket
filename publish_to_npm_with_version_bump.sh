#!/usr/bin/env bash
# Top-level entry point for an npm release: revs the version, then publishes.
#
#   ./publish_to_npm_with_version_bump.sh                 # patch bump, then publish
#   ./publish_to_npm_with_version_bump.sh minor           # or major, or an explicit x.y.z
#   ./publish_to_npm_with_version_bump.sh --dry-run       # rehearsal; uploads nothing
#
# A thin forwarder: every argument, the behavior, and the docs live in
# scripts/publish-npm.sh (and docs-internal/how-to-publish-to-npm.md).

set -euo pipefail

main() {
    local repo_root
    repo_root="$(cd "$(dirname "$0")" && pwd)"
    exec "${repo_root}/scripts/publish-npm.sh" "$@"
}

main "$@"
