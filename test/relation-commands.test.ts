import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Ticket } from "../src/core/ticket.js";
import { TicketStore } from "../src/core/ticket-store.js";
import { UsageError } from "../src/cli/cli-error.js";
import { DepCommand } from "../src/cli/commands/dep.js";
import { LinkClosure, LinkCommand } from "../src/cli/commands/link.js";
import { UndepCommand } from "../src/cli/commands/undep.js";
import { UnlinkCommand } from "../src/cli/commands/unlink.js";

/** No tickets directory is opened by these tests — every case fails before the store. */
const UNUSED_STORE = new TicketStore("/nonexistent-tickets-dir");

const DEP_USAGE = [
    "Usage: ticket dep <id> <dependency-id>",
    "       ticket dep tree <id>  - show dependency tree",
    "       ticket dep cycle      - find dependency cycles",
];

function ticketOf(id: string, links: readonly string[]): Ticket {
    return Ticket.parse(
        `/x/_tickets/${id}.md`,
        [
            "---",
            `id: ${id}`,
            `title: "${id}"`,
            "status: open",
            `links: [${links.join(", ")}]`,
            "---",
            "",
            "Body.",
            "",
        ].join("\n"),
    );
}

function linksOf(ticket: Ticket): string | undefined {
    return ticket.frontmatter.get("links");
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

describe("LinkClosure", () => {
    it("gives each ticket every other ticket's id", () => {
        const closure = LinkClosure.applied([ticketOf("a", []), ticketOf("b", []), ticketOf("c", [])]);
        assert.deepEqual(closure.updated.map(linksOf), ["[b, c]", "[a, c]", "[a, b]"]);
    });

    it("appends ids in the order the tickets were named, not in awk's hash order", () => {
        const closure = LinkClosure.applied([ticketOf("c", []), ticketOf("b", []), ticketOf("a", [])]);
        assert.equal(linksOf(closure.updated[0] as Ticket), "[b, a]");
    });

    it("counts every id it appended, symmetrically", () => {
        const closure = LinkClosure.applied([ticketOf("a", []), ticketOf("b", []), ticketOf("c", [])]);
        assert.equal(closure.addedCount, 6);
    });

    it("counts a pair as two links, one per side", () => {
        const closure = LinkClosure.applied([ticketOf("a", []), ticketOf("b", [])]);
        assert.equal(closure.addedCount, 2);
    });

    it("counts only the pairings that were missing", () => {
        const closure = LinkClosure.applied([
            ticketOf("a", ["b"]),
            ticketOf("b", ["a"]),
            ticketOf("c", []),
        ]);
        assert.equal(closure.addedCount, 4);
    });

    it("leaves an already-complete set unchanged and uncounted", () => {
        const closure = LinkClosure.applied([ticketOf("a", ["b"]), ticketOf("b", ["a"])]);
        assert.deepEqual([closure.updated, closure.addedCount], [[], 0]);
    });

    it("does not rewrite a ticket that needed nothing", () => {
        const closure = LinkClosure.applied([
            ticketOf("a", ["b", "c"]),
            ticketOf("b", ["a", "c"]),
            ticketOf("c", []),
        ]);
        assert.deepEqual(closure.updated.map((ticket) => ticket.id), ["c"]);
    });

    it("appends to the existing ids rather than replacing them", () => {
        const closure = LinkClosure.applied([ticketOf("a", ["z"]), ticketOf("b", [])]);
        assert.equal(linksOf(closure.updated[0] as Ticket), "[z, b]");
    });
});

describe("relation command argument handling", () => {
    it("prints bash's three-line dep usage block when the dependency id is missing", () => {
        assert.deepEqual(usageLinesOf(() => DepCommand.run(UNUSED_STORE, ["some-id"])), DEP_USAGE);
    });

    it("prints the dep usage block for a bare dep", () => {
        assert.deepEqual(usageLinesOf(() => DepCommand.run(UNUSED_STORE, [])), DEP_USAGE);
    });

    it("names the literal `ticket` in undep's usage line, as bash does", () => {
        assert.deepEqual(usageLinesOf(() => UndepCommand.run(UNUSED_STORE, ["some-id"])), [
            "Usage: ticket undep <id> <dependency-id>",
        ]);
    });

    it("names the literal `ticket` in link's usage line, as bash does", () => {
        assert.deepEqual(usageLinesOf(() => LinkCommand.run(UNUSED_STORE, ["some-id"])), [
            "Usage: ticket link <id> <id> [id...]",
        ]);
    });

    it("names the literal `ticket` in unlink's usage line, as bash does", () => {
        assert.deepEqual(usageLinesOf(() => UnlinkCommand.run(UNUSED_STORE, ["some-id"])), [
            "Usage: ticket unlink <id> <target-id>",
        ]);
    });
});
