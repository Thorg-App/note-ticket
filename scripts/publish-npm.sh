#!/usr/bin/env bash
# Publish this package to npm using the NPM_PUBLISH_TOKEN environment variable.
#
# Usage:
#   ./scripts/publish-npm.sh --dry-run   # pack + publish rehearsal, nothing is uploaded
#   ./scripts/publish-npm.sh             # real publish of the version in package.json
#
# The token is never written into the repo and never printed: it lands only in a
# 0600 npmrc under a mktemp dir that is removed on every exit path.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY_HOST="registry.npmjs.org"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

: "${NPM_PUBLISH_TOKEN:?NPM_PUBLISH_TOKEN is not set (npm automation token with publish rights)}"

cd "$REPO_ROOT"

# `npm publish` refuses a dirty-tree surprise less loudly than we want to: an accidental
# publish of uncommitted bytes is unfixable (a version can never be re-published).
if [[ -n "$(git status --porcelain)" ]]; then
    echo "refusing to publish: working tree is dirty (commit or stash first)" >&2
    exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
NAME="$(node -p "require('./package.json').name")"
echo "Publishing ${NAME}@${VERSION} (dry-run=${DRY_RUN})"

# NPM_CONFIG_USERCONFIG overrides ~/.npmrc for this process only, so the token never
# touches the repo, the developer's home config, or the process's argv.
NPMRC_DIR="$(mktemp -d)"
trap 'rm -rf "$NPMRC_DIR"' EXIT
NPMRC="$NPMRC_DIR/npmrc"
(umask 077; printf '//%s/:_authToken=%s\n' "$REGISTRY_HOST" "$NPM_PUBLISH_TOKEN" > "$NPMRC")
export NPM_CONFIG_USERCONFIG="$NPMRC"

# prepack builds dist/ticket.mjs + dist-lib/, so `npm publish` is self-contained. The gates
# run first: a broken bundle must fail HERE, not in a user's install.
make typecheck
make build
make build-lib
npm run --silent test

if [[ "$DRY_RUN" == true ]]; then
    npm publish --dry-run --access public
    echo "Dry run complete -- nothing was uploaded."
    exit 0
fi

npm whoami >/dev/null   # fails fast and clearly on a bad/expired token
npm publish --access public
echo "Published ${NAME}@${VERSION}"
echo "Next: git tag v${VERSION} && git push origin v${VERSION}"
