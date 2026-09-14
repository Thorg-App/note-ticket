/**
 * The pure auto-close run: WHICH epics a run closes and what the closed tickets look like.
 * `DepGraph.completedEpics` (test/dep-graph.test.ts) covers the single-round membership
 * rules; what is asserted here is the iteration to the fixed point and the frontmatter.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EpicAutoClose } from "../src/core/epic-auto-close.js";
import { Ticket } from "../src/core/ticket.js";

const NOW = "2026-09-14T10:00:00Z";

interface TicketSpec {
    readonly id: string;
    readonly status?: string;
    readonly deps?: readonly string[];
    readonly type?: string;
}

function ticketsOf(specs: readonly TicketSpec[]): readonly Ticket[] {
    return specs.map((spec) =>
        Ticket.parse(
            `/t/${spec.id}.md`,
            [
                "---",
                `id: ${spec.id}`,
                `title: "${spec.id}"`,
                `status: ${spec.status ?? "open"}`,
                `deps: [${(spec.deps ?? []).join(", ")}]`,
                `type: ${spec.type ?? "task"}`,
                "status_updated_iso: 2024-01-01T00:00:00Z",
                "---",
                "",
                "Body",
                "",
            ].join("\n"),
        ),
    );
}

function idsOf(tickets: readonly Ticket[]): readonly string[] {
    return tickets.map((ticket) => ticket.id);
}

/** An epic over one closed task — the smallest closable run. */
const FINISHED_EPIC = ticketsOf([
    { id: "e", type: "epic", deps: ["a"] },
    { id: "a", status: "closed" },
]);

describe("EpicAutoClose.closedEpics", () => {
    it("returns the epic whose every dependency is closed", () => {
        assert.deepEqual(idsOf(EpicAutoClose.closedEpics(FINISHED_EPIC, NOW)), ["e"]);
    });

    it("returns it already moved to closed", () => {
        const [epic] = EpicAutoClose.closedEpics(FINISHED_EPIC, NOW);
        assert.equal(epic?.status, "closed");
    });

    it("stamps closed_iso from the given time", () => {
        const [epic] = EpicAutoClose.closedEpics(FINISHED_EPIC, NOW);
        assert.equal(epic?.frontmatter.get("closed_iso"), NOW);
    });

    it("restamps status_updated_iso from the given time", () => {
        const [epic] = EpicAutoClose.closedEpics(FINISHED_EPIC, NOW);
        assert.equal(epic?.frontmatter.get("status_updated_iso"), NOW);
    });

    it("leaves the body untouched", () => {
        const [epic] = EpicAutoClose.closedEpics(FINISHED_EPIC, NOW);
        assert.equal(epic?.body, "\nBody\n");
    });

    it("returns nothing when no epic is finished", () => {
        const tickets = ticketsOf([
            { id: "e", type: "epic", deps: ["a"] },
            { id: "a" },
        ]);
        assert.deepEqual(idsOf(EpicAutoClose.closedEpics(tickets, NOW)), []);
    });

    // The fixed point: `f` waits on `e`, which this very run closes.
    it("closes an epic freed by another epic the same run closes", () => {
        const tickets = ticketsOf([
            { id: "f", type: "epic", deps: ["e"] },
            { id: "e", type: "epic", deps: ["a"] },
            { id: "a", status: "closed" },
        ]);
        assert.deepEqual(idsOf(EpicAutoClose.closedEpics(tickets, NOW)), ["e", "f"]);
    });

    // What makes the command idempotent: applying the result and re-running closes nothing.
    it("closes nothing on a second run over the applied result", () => {
        const tickets = ticketsOf([
            { id: "f", type: "epic", deps: ["e"] },
            { id: "e", type: "epic", deps: ["a"] },
            { id: "a", status: "closed" },
        ]);
        const closed = new Map(EpicAutoClose.closedEpics(tickets, NOW).map((epic) => [epic.id, epic]));
        const applied = tickets.map((ticket) => closed.get(ticket.id) ?? ticket);
        assert.deepEqual(idsOf(EpicAutoClose.closedEpics(applied, NOW)), []);
    });

    // Neither member ever loses its open dependency, so the loop must simply terminate.
    it("closes neither member of a cycle of epics", () => {
        const tickets = ticketsOf([
            { id: "e", type: "epic", deps: ["f"] },
            { id: "f", type: "epic", deps: ["e"] },
        ]);
        assert.deepEqual(idsOf(EpicAutoClose.closedEpics(tickets, NOW)), []);
    });

    it("leaves non-epic tickets alone", () => {
        const tickets = ticketsOf([
            { id: "t", deps: ["a"] },
            { id: "a", status: "closed" },
        ]);
        assert.deepEqual(idsOf(EpicAutoClose.closedEpics(tickets, NOW)), []);
    });
});
