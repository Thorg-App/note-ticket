#!/usr/bin/env bash
#
# Smoke-test the PACKAGED install layout (`make package-smoke`).
#
# WHY this exists: an install that COPIES the tool into a read-only prefix (a distro
# package, a deployment image, a shared /opt tree) is a shape no other gate reaches. CI's
# other smoke step drives a symlink into a CHECKOUT: writable, no bundle, sources rebuilt on
# demand. This one is the copied install: a read-only prefix, a prebuilt bundle, sources that
# must never be rebuilt. An incomplete copy -- the launcher without its `src/` tree -- is
# dead on arrival, and this is the only thing that catches it.
#
# It reads pkg/install-manifest.txt, the single source of truth for what a complete install
# needs, and reuses the repo's already-built bundle instead of running a clean `npm install`
# -- `make build`/`make test` already cover building.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
# Under $REPO/.tmp, never the system temp dir: the installed `ticket` is EXECUTED and the
# system temp dir is mounted noexec in this project's dev container.
SCRATCH="$REPO/.tmp/package-smoke"
PREFIX="$SCRATCH/prefix"
SHARE="$PREFIX/share/ticket-core"
BUNDLE="$SHARE/dist/ticket.mjs"

_fail() { printf 'package-smoke: FAIL: %s\n' "$*" >&2; exit 1; }

# The prefix is made read-only below, so removing it needs write permission back first.
_discard_scratch() {
    [[ -e "$SCRATCH" ]] || return 0
    chmod -R u+w "$SCRATCH"
    rm -rf "$SCRATCH"
}
trap _discard_scratch EXIT
_discard_scratch

[[ -f "$REPO/dist/ticket.mjs" ]] || _fail "no dist/ticket.mjs; run 'make build' first"

# --- install, the way a copied install does --------------------------------------------
mkdir -p "$SHARE" "$PREFIX/bin"
# `|| [[ -n "$entry" ]]`: a manifest without a trailing newline must not lose its last entry.
while read -r entry || [[ -n "$entry" ]]; do
    if [[ -n "$entry" && "$entry" != \#* ]]; then
        cp -a "$REPO/$entry" "$SHARE/"
    fi
done < "$REPO/pkg/install-manifest.txt"
install -Dm644 "$REPO/dist/ticket.mjs" "$BUNDLE"
touch "$BUNDLE"
chmod 755 "$SHARE/ticket"
# `ticket` is the one installed name.
ln -s "$SHARE/ticket" "$PREFIX/bin/ticket"
# node_modules is deliberately NOT installed: a packaged install must run without it.
[[ ! -e "$SHARE/node_modules" ]] || _fail "node_modules leaked into the install"
chmod -R a-w "$SHARE"

# --- assertions ------------------------------------------------------------------------

# The launcher rebuilds when any file under src/ is newer than the bundle, and a rebuild
# into this prefix cannot succeed. Assert the invariant the `touch` above exists to
# guarantee, over the WHOLE tree rather than just src/, so an added install entry cannot
# quietly re-introduce staleness.
newer="$(find "$SHARE" -newer "$BUNDLE" -print -quit)"
[[ -z "$newer" ]] || _fail "installed file is newer than the bundle: [$newer]"

REPO_UNDER_TEST="$SCRATCH/repo"
mkdir -p "$REPO_UNDER_TEST"
git init -q "$REPO_UNDER_TEST"
git -C "$REPO_UNDER_TEST" config user.name 'Package Smoke'
export PATH="$PREFIX/bin:$PATH"

# Drives an INSTALLED symlink by name, and holds stderr to the same standard the checkout
# smoke test does: empty. Any launcher chatter here means it tried to rebuild.
_run_installed() {
    local program="$1" label="$2" expected="$3"; shift 3
    local out err rc=0
    out="$SCRATCH/$label.out"
    err="$SCRATCH/$label.err"
    # `command`: a developer shell can EXPORT a function of this name (this one did), which bash
    # inherits and which would run their installed tool instead of the one just staged.
    ( cd "$REPO_UNDER_TEST" && command "$program" "$@" ) > "$out" 2> "$err" || rc=$?
    [[ $rc -eq 0 ]] || _fail "$program $* exited $rc; stderr: $(cat "$err")"
    [[ ! -s "$err" ]] || _fail "$program $* wrote to stderr (a rebuild attempt?): $(cat "$err")"
    grep -q "$expected" "$out" || _fail "$program $* stdout lacks [$expected]"
}

# `ticket - ...` also proves the program name reached the CLI through the symlink.
_run_installed ticket help 'ticket - minimal ticket system' help
_run_installed ticket create full_path create "Packaged smoke ticket"
_run_installed ticket ls 'Packaged smoke ticket' ls
# Second run: still no rebuild attempt against the read-only prefix.
_run_installed ticket ls-again 'Packaged smoke ticket' ls

echo "package-smoke: OK"
