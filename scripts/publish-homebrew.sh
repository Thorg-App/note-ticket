#!/usr/bin/env bash
# Publish ticket-core to Homebrew tap
# Usage: ./scripts/publish-homebrew.sh <version> <sha256>
# Requires: TAP_GITHUB_TOKEN environment variable

set -euo pipefail

VERSION="${1#v}"
SHA256="$2"
TAP_REPO="wedow/homebrew-tools"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# The formula's install list, rendered as a Ruby argument list (`"ticket", "src", ...`) from
# pkg/install-manifest.txt -- the single source of truth for what a complete install needs.
# Interpolated at publish time so the formula itself stays a plain, auditable static file.
install_list_ruby() {
    local entry rendered=""
    while read -r entry; do
        if [[ -n "$entry" && "$entry" != \#* ]]; then
            [[ -z "$rendered" ]] || rendered+=", "
            rendered+="\"$entry\""
        fi
    done < "$REPO_ROOT/pkg/install-manifest.txt"
    echo "$rendered"
}

main() {
    echo "Publishing ticket-core to Homebrew tap (v$VERSION)"

    local install_list
    install_list="$(install_list_ruby)"

    # Clone tap
    local tap_dir="/tmp/homebrew-tap"
    rm -rf "$tap_dir"
    git clone "https://x-access-token:${TAP_GITHUB_TOKEN}@github.com/${TAP_REPO}.git" "$tap_dir"

    local formula_dir="$tap_dir/Formula"
    mkdir -p "$formula_dir"

    # Update ticket-core formula
    echo "Updating ticket-core..."
    cat > "$formula_dir/ticket-core.rb" << EOF
class TicketCore < Formula
  desc "Minimal ticket tracking CLI, git-backed markdown tickets with dependencies"
  homepage "https://github.com/wedow/ticket"
  url "https://github.com/wedow/ticket/archive/refs/tags/v$VERSION.tar.gz"
  sha256 "$SHA256"
  license "MIT"

  # node runs the CLI and supplies the npm used below; git resolves the repo root that
  # anchors _tickets/. jq is needed only for \`tk query <jq-filter>\`, so it is not a hard dep.
  depends_on "node"
  depends_on "git"

  def install
    # WHY the bundle is built HERE and not on first run: \`ticket\` builds dist/ticket.mjs on
    # demand next to itself, which works from a git checkout but cannot work from a
    # root-owned Cellar (esbuild fails with "mkdir dist: permission denied"). Building at
    # install time also keeps npm and the network off the user's box afterwards.
    system "npm", "install", "--no-audit", "--no-fund"
    system "npm", "run", "build"

    # Install list generated from pkg/install-manifest.txt -- the single source of truth for
    # what a complete install needs. node_modules is deliberately NOT installed: nothing at
    # runtime reads it.
    libexec.install $install_list
    (libexec/"dist").install "dist/ticket.mjs"
    # The launcher rebuilds when any source file is newer than the bundle. Make the bundle
    # the newest file installed so a packaged install never tries to write into the Cellar.
    touch libexec/"dist/ticket.mjs"

    chmod 0755, libexec/"ticket"
    bin.install_symlink libexec/"ticket" => "tk"
  end

  test do
    system "git", "init", testpath/"repo"
    system "#{bin}/tk", "help"
    assert_match "full_path", shell_output("cd #{testpath}/repo && #{bin}/tk create Hello")
  end
end
EOF

    # Commit and push
    cd "$tap_dir"
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add Formula/

    if git diff --cached --quiet; then
        echo "No changes to publish"
        exit 0
    fi

    git commit -m "ticket-core v$VERSION"
    git push

    echo "Formula published successfully!"
}

main "$@"
