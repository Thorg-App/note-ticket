import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FixedClock } from "../src/core/clock.js";
import { StatusUpdate } from "../src/core/status-update.js";
import { Ticket } from "../src/core/ticket.js";
import { TicketStore } from "../src/core/ticket-store.js";
import { UsageError } from "../src/cli/cli-error.js";
import { CommandEnvironment } from "../src/cli/command-environment.js";
import { STATUS_WRAPPERS, StatusCommand } from "../src/cli/commands/status.js";

const NOW = "2026-07-30T11:00:00Z";
const CREATED = "2024-01-01T00:00:00Z";

/** The invoked program name is deliberately NOT "ticket": usage text must interpolate it. */
const PROGRAM_NAME = "tk";

/** No tickets directory is ever opened by these tests — every case fails before the store. */
const UNUSED_STORE = new TicketStore("/nonexistent-tickets-dir");

function environment(): CommandEnvironment {
    return new CommandEnvironment(PROGRAM_NAME, new FixedClock(NOW));
}

function ticketOf(extraFields: readonly string[] = []): Ticket {
    return Ticket.parse(
        "/x/_tickets/t.md",
        [
            "---",
            ...extraFields,
            "id: nid_t_e",
            'title: "t"',
            "status: open",
            `status_updated_iso: ${CREATED}`,
            "---",
            "",
            "",
        ].join("\n"),
    );
}

/** Lines of the frontmatter block, so key ORDER can be asserted and not just membership. */
function frontmatterLines(ticket: Ticket): readonly string[] {
    return ticket.frontmatter.toLines();
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

describe("StatusUpdate", () => {
    it("restamps status_updated_iso from the clock", () => {
        const updated = StatusUpdate.applied(ticketOf(), "in_progress", NOW);
        assert.equal(updated.frontmatter.get("status_updated_iso"), NOW);
    });

    it("inserts closed_iso as the FIRST frontmatter entry, where bash's sed puts it", () => {
        const updated = StatusUpdate.applied(ticketOf(), "closed", NOW);
        assert.equal(frontmatterLines(updated)[0], `closed_iso: ${NOW}`);
    });

    it("keeps the other keys in file order when closing", () => {
        const updated = StatusUpdate.applied(ticketOf(), "closed", NOW);
        assert.deepEqual(frontmatterLines(updated).slice(1), [
            "id: nid_t_e",
            'title: "t"',
            "status: closed",
            `status_updated_iso: ${NOW}`,
        ]);
    });

    it("drops closed_iso for any status but closed", () => {
        const closed = ticketOf([`closed_iso: ${CREATED}`]);
        assert.equal(StatusUpdate.applied(closed, "open", NOW).frontmatter.has("closed_iso"), false);
    });

    it("leaves a ticket that was never closed without a closed_iso", () => {
        assert.equal(StatusUpdate.applied(ticketOf(), "in_progress", NOW).frontmatter.has("closed_iso"), false);
    });

    it("refreshes closed_iso when an already-closed ticket is closed again", () => {
        const closed = ticketOf([`closed_iso: ${CREATED}`]);
        assert.equal(StatusUpdate.applied(closed, "closed", NOW).frontmatter.get("closed_iso"), NOW);
    });
});

describe("StatusCommand argument handling", () => {
    it("prints the invoked program name in the status usage line", () => {
        assert.deepEqual(usageLinesOf(() => StatusCommand.run(UNUSED_STORE, [], environment())), [
            "Usage: tk status <id> <status>",
            "Valid statuses: open in_progress closed punted",
        ]);
    });

    it("rejects a status command missing its status argument", () => {
        assert.deepEqual(usageLinesOf(() => StatusCommand.run(UNUSED_STORE, ["some-id"], environment())), [
            "Usage: tk status <id> <status>",
            "Valid statuses: open in_progress closed punted",
        ]);
    });

    it("prints the invoked program name and the wrapper's own name in its usage line", () => {
        assert.deepEqual(
            usageLinesOf(() => StatusCommand.runWrapper(UNUSED_STORE, [], environment(), STATUS_WRAPPERS.close)),
            ["Usage: tk close <id>"],
        );
    });

    it("maps each wrapper to the status bash's cmd_start/cmd_close/cmd_reopen pass on", () => {
        assert.deepEqual(
            [STATUS_WRAPPERS.start.status, STATUS_WRAPPERS.close.status, STATUS_WRAPPERS.reopen.status],
            ["in_progress", "closed", "open"],
        );
    });
});
