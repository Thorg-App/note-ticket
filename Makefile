.PHONY: test build typecheck unit-test package-smoke

# node_modules is a directory whose mtime is unreliable as a target; the stamp
# makes `npm install` run only when the manifest changes.
NPM_STAMP := node_modules/.install-stamp

$(NPM_STAMP): package.json
	npm install --no-audit --no-fund --silent
	@touch $@

build: $(NPM_STAMP)
	npm run --silent build
	chmod +x dist/ticket.mjs

typecheck: $(NPM_STAMP)
	npm run --silent typecheck

# node:test unit tests over src/core + src/cli. BDD stays the acceptance harness; these
# cover the algorithms and the arms BDD cannot reach (anything gated on a terminal).
unit-test: $(NPM_STAMP)
	npm run --silent test

# WHY `build` is still a prerequisite now that ./ticket builds on demand: a broken build
# must surface HERE, as a build failure, instead of as a puzzling failure inside whichever
# BDD scenario happens to shell out first. It also keeps the ~200 scenarios off the build
# path entirely. The on-demand path is not left untested: features/ticket_wrapper.feature
# exercises it against an isolated copy of the tool, and CI smoke-tests a checkout with no
# dist/ at all before this target ever runs.
test: build unit-test
	uv run --with behave behave

# The PACKAGED shape (read-only prefix, prebuilt bundle, no node_modules), which no other
# target reaches -- `test`'s wrapper scenarios and CI's other smoke step both drive a
# writable checkout. See the script's header for what it does and does not claim.
package-smoke: build
	./scripts/package-smoke.sh
