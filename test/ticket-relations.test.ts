import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Ticket } from "../src/core/ticket.js";
import { TicketRelation } from "../src/core/ticket-relations.js";

const DEPENDENCY = TicketRelation.DEPENDENCY;
const LINK = TicketRelation.LINK;

/**
 * Short, hand-written ids where one is a SUBSTRING of another. Generated ids are all the same
 * length so none can contain another, but hand-edited and legacy ids (this repo's own
 * `task-0001` era) can, and that is exactly where bash's text matching went wrong.
 */
const ONE = "t-1";
const ELEVEN = "t-11";

function ticketOf(fields: readonly string[]): Ticket {
    return Ticket.parse(
        "/x/_tickets/t.md",
        ["---", "id: t-9", 'title: "t"', "status: open", ...fields, "---", "", "Body.", ""].join("\n"),
    );
}

/** The raw on-disk text of a field, so serialization is asserted and not just membership. */
function rawField(ticket: Ticket | undefined, key: string): string | undefined {
    return ticket?.frontmatter.get(key);
}

describe("TicketRelation reading", () => {
    it("reads the ids of the field it addresses", () => {
        const ticket = ticketOf([`deps: [${ONE}]`, `links: [${ELEVEN}]`]);
        assert.deepEqual([DEPENDENCY.idsOf(ticket), LINK.idsOf(ticket)], [[ONE], [ELEVEN]]);
    });

    it("treats a missing field as an empty relation instead of failing as bash did", () => {
        assert.deepEqual(DEPENDENCY.idsOf(ticketOf([])), []);
    });

    // DIVERGENCE #13, the NON-ARRAY sub-case. Reachable by hand-editing, and bash read the
    // raw text, so `deps: foo` was neither an array nor an error to it.
    it("reads a scalar value as a single-element relation", () => {
        assert.deepEqual(DEPENDENCY.idsOf(ticketOf(["deps: foo"])), ["foo"]);
    });
});

describe("TicketRelation adding", () => {
    it("appends the id to an empty array", () => {
        const updated = DEPENDENCY.withAdded(ticketOf(["deps: []"]), ONE);
        assert.equal(rawField(updated, "deps"), `[${ONE}]`);
    });

    // bash's insert was `sed "s/\\]/, $dep_id]/"`, and a scalar has no `]` to insert before,
    // so it printed `Added dependency: …` and wrote nothing at all.
    it("re-serializes a scalar value as an array when adding to it", () => {
        const updated = DEPENDENCY.withAdded(ticketOf(["deps: foo"]), ONE);
        assert.equal(rawField(updated, "deps"), `[foo, ${ONE}]`);
    });

    it("appends after the existing ids, in order", () => {
        const updated = DEPENDENCY.withAdded(ticketOf([`deps: [${ELEVEN}]`]), ONE);
        assert.equal(rawField(updated, "deps"), `[${ELEVEN}, ${ONE}]`);
    });

    it("creates the field when the ticket has none", () => {
        const updated = DEPENDENCY.withAdded(ticketOf([]), ONE);
        assert.equal(rawField(updated, "deps"), `[${ONE}]`);
    });

    it("inserts a created field as the FIRST frontmatter entry, where bash's sed put it", () => {
        const updated = DEPENDENCY.withAdded(ticketOf([]), ONE);
        assert.equal(updated?.frontmatter.toLines()[0], `deps: [${ONE}]`);
    });

    it("reports no change when the id is already an element", () => {
        assert.equal(DEPENDENCY.withAdded(ticketOf([`deps: [${ONE}]`]), ONE), undefined);
    });

    it("adds an id that merely OCCURS inside a recorded one", () => {
        const updated = DEPENDENCY.withAdded(ticketOf([`deps: [${ELEVEN}]`]), ONE);
        assert.equal(rawField(updated, "deps"), `[${ELEVEN}, ${ONE}]`);
    });

    it("adds an id a recorded one is a PREFIX of", () => {
        const updated = DEPENDENCY.withAdded(ticketOf([`deps: [${ONE}]`]), ELEVEN);
        assert.equal(rawField(updated, "deps"), `[${ONE}, ${ELEVEN}]`);
    });

    it("adds several ids at once, in the order given, counting only the new ones", () => {
        const addition = LINK.withAllAdded(ticketOf([`links: [${ONE}]`]), [ELEVEN, ONE, "t-2"]);
        assert.deepEqual(
            [rawField(addition.ticket, "links"), addition.addedCount],
            [`[${ONE}, ${ELEVEN}, t-2]`, 2],
        );
    });

    it("returns the ticket unchanged when every id is already there", () => {
        const ticket = ticketOf([`links: [${ONE}]`]);
        const addition = LINK.withAllAdded(ticket, [ONE]);
        assert.deepEqual([addition.ticket, addition.addedCount], [ticket, 0]);
    });

    it("touches only the field it addresses", () => {
        const updated = DEPENDENCY.withAdded(ticketOf(["deps: []", "links: []"]), ONE);
        assert.equal(rawField(updated, "links"), "[]");
    });
});

describe("TicketRelation removing", () => {
    it("empties an array whose only element it removes", () => {
        const updated = DEPENDENCY.withRemoved(ticketOf([`deps: [${ONE}]`]), ONE);
        assert.equal(rawField(updated, "deps"), "[]");
    });

    it("keeps a sibling id that CONTAINS the removed one intact", () => {
        const updated = DEPENDENCY.withRemoved(ticketOf([`deps: [${ONE}, ${ELEVEN}]`]), ONE);
        assert.equal(rawField(updated, "deps"), `[${ELEVEN}]`);
    });

    it("keeps a sibling id the removed one CONTAINS intact", () => {
        const updated = DEPENDENCY.withRemoved(ticketOf([`deps: [${ONE}, ${ELEVEN}]`]), ELEVEN);
        assert.equal(rawField(updated, "deps"), `[${ONE}]`);
    });

    it("removes every occurrence of a duplicated id", () => {
        const updated = DEPENDENCY.withRemoved(ticketOf([`deps: [${ONE}, ${ELEVEN}, ${ONE}]`]), ONE);
        assert.equal(rawField(updated, "deps"), `[${ELEVEN}]`);
    });

    it("reports no change when the id is not an element", () => {
        assert.equal(DEPENDENCY.withRemoved(ticketOf([`deps: [${ELEVEN}]`]), ONE), undefined);
    });

    it("reports no change when the field is absent", () => {
        assert.equal(LINK.withRemoved(ticketOf([]), ONE), undefined);
    });
});
