#!/usr/bin/env bash
# Publish this package to npm using the NPM_PUBLISH_TOKEN environment variable.
#
# Usage:
#   ./scripts/publish-npm.sh [--dry-run] [--no-bump] [patch|minor|major|<x.y.z>]
#
#   ./scripts/publish-npm.sh                 # bump the patch version, then publish
#   ./scripts/publish-npm.sh minor           # bump the minor version, then publish
#   ./scripts/publish-npm.sh 1.0.0           # set an explicit version, then publish
#   ./scripts/publish-npm.sh --dry-run       # rehearsal: bumps, packs, then UNDOES the bump
#   ./scripts/publish-npm.sh --no-bump       # publish package.json's version as-is
#
# The version bump is committed BEFORE the upload, so every published tarball
# corresponds to a commit. A dry run reverts its own bump on every exit path.
#
# The token is never written into the repo and never printed: it lands only in a
# 0600 npmrc under a mktemp dir that is removed on every exit path.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY_HOST="registry.npmjs.org"
DEFAULT_BUMP="patch"
# The files `npm version` rewrites; the only paths a bump may touch.
VERSION_FILES=(package.json package-lock.json)

DRY_RUN=false
BUMP="$DEFAULT_BUMP"

usage() {
    echo "Usage: $0 [--dry-run] [--no-bump] [patch|minor|major|<x.y.z>]" >&2
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true ;;
        --no-bump) BUMP="" ;;
        -h|--help) usage ;;
        -*) echo "unknown option: [$1]" >&2; usage ;;
        *) BUMP="$1" ;;
    esac
    shift
done

: "${NPM_PUBLISH_TOKEN:?NPM_PUBLISH_TOKEN is not set (npm automation token with publish rights)}"

cd "$REPO_ROOT"

# `npm publish` refuses a dirty-tree surprise less loudly than we want to: an accidental
# publish of uncommitted bytes is unfixable (a version can never be re-published). It is
# also what makes the bump revert below safe -- there is nothing else to lose.
if [[ -n "$(git status --porcelain)" ]]; then
    echo "refusing to publish: working tree is dirty (commit or stash first)" >&2
    exit 1
fi

NPMRC_DIR=""
VERSION_BEFORE_BUMP=""
BUMP_COMMITTED=false

cleanup() {
    [[ -n "$NPMRC_DIR" ]] && rm -rf "$NPMRC_DIR"
    # An uncommitted bump is ours and only ours (the tree was clean), so undoing it on any
    # failure -- and on a completed dry run -- leaves the checkout exactly as we found it.
    if [[ -n "$VERSION_BEFORE_BUMP" && "$BUMP_COMMITTED" == false ]]; then
        git checkout -- "${VERSION_FILES[@]}"
        echo "reverted version bump; package.json stays at ${VERSION_BEFORE_BUMP}" >&2
    fi
}
trap cleanup EXIT

package_field() { node -p "require('./package.json').$1"; }

NAME="$(package_field name)"

# The gates run BEFORE the bump: a broken bundle must fail HERE, not in a user's
# install, and failing before the bump keeps the tree untouched in the common case.
make typecheck
make build
make build-lib
npm run --silent test

if [[ -n "$BUMP" ]]; then
    VERSION_BEFORE_BUMP="$(package_field version)"
    # --no-git-tag-version: the commit (and the tag, later, by hand) are ours to make.
    npm version "$BUMP" --no-git-tag-version >/dev/null
    echo "Bumped ${NAME}: ${VERSION_BEFORE_BUMP} -> $(package_field version) (${BUMP})"
fi

VERSION="$(package_field version)"
echo "Publishing ${NAME}@${VERSION} (dry-run=${DRY_RUN})"

# NPM_CONFIG_USERCONFIG overrides ~/.npmrc for this process only, so the token never
# touches the repo, the developer's home config, or the process's argv.
NPMRC_DIR="$(mktemp -d)"
NPMRC="$NPMRC_DIR/npmrc"
(umask 077; printf '//%s/:_authToken=%s\n' "$REGISTRY_HOST" "$NPM_PUBLISH_TOKEN" > "$NPMRC")
export NPM_CONFIG_USERCONFIG="$NPMRC"

# prepack builds dist/ticket.mjs + dist-lib/, so `npm publish` is self-contained.
if [[ "$DRY_RUN" == true ]]; then
    npm publish --dry-run --access public
    echo "Dry run complete -- nothing was uploaded."
    exit 0
fi

npm whoami >/dev/null   # fails fast and clearly on a bad/expired token

if [[ -n "$VERSION_BEFORE_BUMP" ]]; then
    git commit --quiet -m "release: v${VERSION}" -- "${VERSION_FILES[@]}"
    BUMP_COMMITTED=true
    echo "Committed release: v${VERSION}"
fi

npm publish --access public
echo "Published ${NAME}@${VERSION}"
echo "Next: git tag v${VERSION} && git push && git push origin v${VERSION}"
