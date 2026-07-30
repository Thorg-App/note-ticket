.PHONY: test build typecheck unit-test

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

# node:test unit tests over src/core. BDD stays the acceptance harness; these cover
# the core algorithms (parser, graph) where bash had no tests.
unit-test: $(NPM_STAMP)
	npm run --silent test

# The bash `ticket` delegates TS_COMMANDS to dist/ticket.mjs, so the bundle must
# exist before the BDD suite runs.
test: build unit-test
	uv run --with behave behave
