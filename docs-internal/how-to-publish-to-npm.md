# How to publish `note-ticket` to npm

The package publishes two surfaces from one tarball: the CLI bin (`dist/ticket.mjs`, linked
as `ticket`) and the library entry (`dist-lib/index.js` + `.d.ts`). `prepack` builds both, so
publishing needs no manual build step — but `scripts/publish-npm.sh` runs the gates
first anyway.

## Prerequisites

- `NPM_PUBLISH_TOKEN` exported in your shell: an npm **automation** token with publish
  rights on the `note-ticket` name. Never paste it into a file, a command line, or a
  prompt — the script reads it from the environment only.
- npm account has 2FA set to "auth only" (not "auth and writes"), or an automation
  token, since the script publishes non-interactively.
- `node`, `npm`, `uv` (only if you also run `make test`).

## Publish

```bash
./scripts/publish-npm.sh --dry-run   # builds, tests, packs; uploads nothing
./scripts/publish-npm.sh             # patch bump + the real thing
```

`./publish_to_npm_with_version_bump.sh` at the repo root is a thin forwarder to the same
script (same arguments, works from any cwd) — there so the release entry point is visible
without digging through `scripts/`.

The script:

1. refuses a dirty working tree (a published version can never be re-published, and a
   clean tree is what makes the bump revert in step 5 safe),
2. writes the token to a `0600` npmrc under `mktemp -d`, pointed at by
   `NPM_CONFIG_USERCONFIG` and deleted on exit — the token never reaches the repo,
   `~/.npmrc`, or any process's argv,
3. runs `make typecheck build build-lib` + `npm test`,
4. bumps `package.json` (+ `package-lock.json`) — **patch by default** — and commits it
   as `release: v<version>`, so every published tarball corresponds to a commit,
5. `npm publish --access public` (which triggers `prepack`). If anything fails before the
   commit — and on every dry run — the bump is reverted and the checkout is left as found,
6. prints the `git tag` command to run next.

## Versioning

```bash
./scripts/publish-npm.sh             # 0.1.0 -> 0.1.1  (default: patch)
./scripts/publish-npm.sh minor       # 0.1.0 -> 0.2.0
./scripts/publish-npm.sh major       # 0.1.0 -> 1.0.0
./scripts/publish-npm.sh 1.4.2       # explicit version
./scripts/publish-npm.sh --no-bump   # publish package.json's version as-is
```

The bump argument is passed straight to `npm version --no-git-tag-version`, so anything
that accepts (`prerelease`, `premajor`, …) works too. Tagging stays manual:

```bash
./scripts/publish-npm.sh             # commits "release: v0.1.1" and publishes
git tag v0.1.1 && git push && git push origin v0.1.1
```

Move `## [Unreleased]` in `CHANGELOG.md` to the new version + date before publishing —
the script bumps `package.json` only, it does not touch the changelog.

The tag push runs `.github/workflows/release.yml`, which only creates the GitHub release.
**npm is NOT wired into that workflow** — publishing to npm is deliberately a local,
manual step. To automate it, add an `NPM_PUBLISH_TOKEN` repo secret and a step running
this script; nothing else in the flow changes.

## What ships

`npm pack --dry-run` to see it. `package.json` `files` ships `dist-lib/`,
`dist/ticket.mjs`, `docs/`, `CHANGELOG.md`, `THIRD_PARTY_LICENSES.md`; npm always adds
`README.md`, `LICENSE.md` and `package.json`. **No `src/`, no `ticket` launcher** — an
npm install runs the prebuilt bundle directly via the `bin` entry, and never builds.

## Verify after publishing

```bash
cd "$(mktemp -d)" && npm install note-ticket
npx ticket help
node -e "import('note-ticket').then(m => console.log(Object.keys(m)))"
```

## Notes

- The name `note-ticket` was unclaimed on npm as of 2026-08-02 (`npm view note-ticket`
  → 404), so `0.1.0` is a first publish. The package name is not owner-confirmed; check
  before the first publish.
- Mistakes: `npm unpublish note-ticket@<version>` works only within 72 hours and only if
  nothing depends on it. Prefer `npm deprecate` + a fixed patch release.
