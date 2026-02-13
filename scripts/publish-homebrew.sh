#!/usr/bin/env bash
# Publish ticket-core to Homebrew tap
# Usage: ./scripts/publish-homebrew.sh <version> <sha256>
# Requires: TAP_GITHUB_TOKEN environment variable

set -euo pipefail

VERSION="${1#v}"
SHA256="$2"
TAP_REPO="wedow/homebrew-tools"

main() {
    echo "Publishing ticket-core to Homebrew tap (v$VERSION)"

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
  desc "Minimal ticket tracking in bash (core only)"
  homepage "https://github.com/wedow/ticket"
  url "https://github.com/wedow/ticket/archive/refs/tags/v$VERSION.tar.gz"
  sha256 "$SHA256"
  license "MIT"

  def install
    bin.install "ticket" => "tk"
  end

  test do
    system "#{bin}/tk", "help"
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
