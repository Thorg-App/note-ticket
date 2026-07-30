.PHONY: test build typecheck unit-test parity

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

# Differential bash-vs-TS parity harness (scripts/parity/). Migration-only: it is
# deleted at T6 when bash `ticket` goes away and there is nothing left to diff against.
# Scale the generated graphs with e.g. `make parity PARITY_ARGS="--random 500"`.
# Depends on `build`: the checks run the shipped dist/ticket.mjs for every command
# already flipped into TS_COMMANDS, and a stale bundle would measure the wrong code.
PARITY_ARGS ?=
parity: build
	npm run --silent build:parity
	python3 scripts/parity/run.py $(PARITY_ARGS)

# The bash `ticket` delegates TS_COMMANDS to dist/ticket.mjs, so the bundle must
# exist before the BDD suite runs.
test: build unit-test
	uv run --with behave behave
