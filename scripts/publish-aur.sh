#!/usr/bin/env bash
# Publish ticket-core to AUR
# Usage: ./scripts/publish-aur.sh <version> <sha256>
# Requires: AUR_SSH_KEY environment variable

set -euo pipefail

VERSION="${1#v}"
SHA256="$2"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Setup SSH for AUR access
setup_ssh() {
    mkdir -p ~/.ssh
    echo "$AUR_SSH_KEY" > ~/.ssh/aur
    chmod 600 ~/.ssh/aur
    cat >> ~/.ssh/config << 'EOF'
Host aur.archlinux.org
  IdentityFile ~/.ssh/aur
  User aur
  StrictHostKeyChecking accept-new
EOF
    ssh-keyscan aur.archlinux.org >> ~/.ssh/known_hosts 2>/dev/null
}

# Generate .SRCINFO using Docker
generate_srcinfo() {
    local pkg_dir="$1"
    docker run --rm -v "$pkg_dir:/pkg" -w /pkg archlinux:latest bash -c "
        pacman -Sy --noconfirm pacman-contrib >/dev/null 2>&1
        useradd -m builder 2>/dev/null || true
        chown -R builder .
        su builder -c 'makepkg --printsrcinfo' > .SRCINFO
    "
}

# Push package to AUR (creates repo if it doesn't exist)
push_to_aur() {
    local pkgname="$1"
    local pkg_dir="$2"

    echo "Publishing $pkgname to AUR..."

    local aur_dir="/tmp/aur-$pkgname"
    rm -rf "$aur_dir"

    # Clone existing or initialize new
    if ! git clone "ssh://aur@aur.archlinux.org/$pkgname.git" "$aur_dir" 2>/dev/null; then
        echo "  Creating new AUR package: $pkgname"
        mkdir -p "$aur_dir"
        git -C "$aur_dir" init
        git -C "$aur_dir" remote add origin "ssh://aur@aur.archlinux.org/$pkgname.git"
    fi

    # Copy PKGBUILD and generate .SRCINFO
    cp "$pkg_dir/PKGBUILD" "$aur_dir/"
    generate_srcinfo "$aur_dir"

    # Commit and push
    git -C "$aur_dir" config user.name "github-actions[bot]"
    git -C "$aur_dir" config user.email "github-actions[bot]@users.noreply.github.com"
    git -C "$aur_dir" add PKGBUILD .SRCINFO

    if git -C "$aur_dir" diff --cached --quiet; then
        echo "  No changes for $pkgname"
        return 0
    fi

    git -C "$aur_dir" commit -m "Update to v$VERSION"
    git -C "$aur_dir" push -u origin master
    echo "  Published $pkgname"
}

# Update PKGBUILD with version and SHA
update_pkgbuild() {
    local pkgbuild="$1"
    local version="$2"
    local sha="$3"

    sed -i "s|^pkgver=.*|pkgver=$version|" "$pkgbuild"
    sed -i "s|^sha256sums=.*|sha256sums=('$sha')|" "$pkgbuild"
    sed -i "s|^pkgrel=.*|pkgrel=1|" "$pkgbuild"
}

main() {
    echo "Publishing ticket-core to AUR (v$VERSION)"

    setup_ssh

    echo ""
    echo "=== ticket-core ==="
    update_pkgbuild "$REPO_ROOT/pkg/aur/ticket-core/PKGBUILD" "$VERSION" "$SHA256"
    push_to_aur "ticket-core" "$REPO_ROOT/pkg/aur/ticket-core"

    echo ""
    echo "Package published successfully!"
}

main "$@"
