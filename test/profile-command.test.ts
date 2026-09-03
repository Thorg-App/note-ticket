import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FixedClock } from "../src/core/clock.js";
import { TicketStore } from "../src/core/ticket-store.js";
import { CliError, UsageError } from "../src/cli/cli-error.js";
import { CommandEnvironment } from "../src/cli/command-environment.js";
import { ProfileCommand, TicketProfileArgument } from "../src/cli/commands/profile.js";

const NOW = "2026-07-30T11:00:00Z";

/** The invoked program name is deliberately NOT "ticket": usage text must interpolate it. */
const PROGRAM_NAME = "tk";

/** No tickets directory is ever opened by these tests — every case fails before the store. */
const UNUSED_STORE = new TicketStore("/nonexistent-tickets-dir");

function environment(): CommandEnvironment {
    return new CommandEnvironment(PROGRAM_NAME, new FixedClock(NOW));
}

function usageLinesOf(run: () => number): readonly string[] {
    try {
        run();
    } catch (error) {
        assert.ok(error instanceof UsageError, `expected a UsageError, got ${String(error)}`);
        return error.usageLines;
    }
    return assert.fail("expected the command to reject its arguments");
}

describe("TicketProfileArgument", () => {
    it("accepts standard", () => {
        assert.equal(TicketProfileArgument.parsed("standard"), "standard");
    });

    it("accepts higher", () => {
        assert.equal(TicketProfileArgument.parsed("higher"), "higher");
    });

    it("rejects an unknown profile with the accepted values named", () => {
        assert.throws(() => TicketProfileArgument.parsed("invalid"), (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.message, "invalid profile 'invalid'. Must be one of: standard higher");
            return true;
        });
    });
});

describe("ProfileCommand argument handling", () => {
    it("prints the invoked program name and the valid profiles in the usage line", () => {
        assert.deepEqual(usageLinesOf(() => ProfileCommand.run(UNUSED_STORE, [], environment())), [
            "Usage: tk profile <id> <profile>",
            "Valid profiles: standard higher",
        ]);
    });

    it("rejects a profile command missing its profile argument", () => {
        assert.deepEqual(usageLinesOf(() => ProfileCommand.run(UNUSED_STORE, ["some-id"], environment())), [
            "Usage: tk profile <id> <profile>",
            "Valid profiles: standard higher",
        ]);
    });
});
