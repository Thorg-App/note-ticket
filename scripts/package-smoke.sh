#!/usr/bin/env bash
#
# Smoke-test the PACKAGED install layout (`make package-smoke`).
#
# WHY this exists: the Homebrew formula shipped `bin.install "ticket" => "tk"` -- one file,
# no sources -- and was dead on arrival for months, because nothing in the repo ever built
# the packaged shape. CI's other smoke step drives a symlink into a CHECKOUT, which is a
# different shape: writable, no bundle, sources rebuilt on demand. This one is the package:
# a read-only prefix, a prebuilt bundle, sources that must never be rebuilt.
#
# It is a SMOKE TEST, not a package-manager emulator: it replays the install steps that
# `pkg/aur/ticket-core/PKGBUILD`'s package() and the formula's `def install` share, reading
# the same pkg/install-manifest.txt they read. It does not run makepkg or brew (neither is
# available in CI here), and it reuses the repo's already-built bundle instead of running a
# clean `npm install` -- `make build`/`make test` already cover building.
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

# --- install, the way both packages do -------------------------------------------------
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
# Both packages install BOTH names: `ticket` (documented) and `tk` (historical shorthand).
ln -s "$SHARE/ticket" "$PREFIX/bin/ticket"
ln -s "$SHARE/ticket" "$PREFIX/bin/tk"
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
    # `command`: a developer shell can EXPORT a `tk` function (this one did), which bash
    # inherits and which would run their installed tool instead of the one just staged.
    ( cd "$REPO_UNDER_TEST" && command "$program" "$@" ) > "$out" 2> "$err" || rc=$?
    [[ $rc -eq 0 ]] || _fail "$program $* exited $rc; stderr: $(cat "$err")"
    [[ ! -s "$err" ]] || _fail "$program $* wrote to stderr (a rebuild attempt?): $(cat "$err")"
    grep -q "$expected" "$out" || _fail "$program $* stdout lacks [$expected]"
}

# `<name> - ...` also proves the program name reached the CLI through the symlink -- and that
# each installed name reports ITSELF in its usage text.
_run_installed ticket help 'ticket - minimal ticket system' help
_run_installed tk help-tk 'tk - minimal ticket system' help
_run_installed ticket create full_path create "Packaged smoke ticket"
_run_installed ticket ls 'Packaged smoke ticket' ls
# Second run: still no rebuild attempt against the read-only prefix.
_run_installed ticket ls-again 'Packaged smoke ticket' ls

echo "package-smoke: OK"
