import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DepGraph, type TreeRow } from "../src/core/dep-graph.js";
import { Ticket } from "../src/core/ticket.js";

interface TicketSpec {
    readonly id: string;
    readonly status?: string;
    readonly deps?: readonly string[];
    readonly priority?: string;
    readonly parent?: string;
    readonly title?: string;
}

/** Builds tickets from specs, in the given order (= enumeration order). */
function graphOf(specs: readonly TicketSpec[]): DepGraph {
    return DepGraph.build(
        specs.map((spec) => {
            const lines = [
                "---",
                `id: ${spec.id}`,
                `title: "${spec.title ?? spec.id}"`,
                `status: ${spec.status ?? "open"}`,
                `deps: [${(spec.deps ?? []).join(", ")}]`,
            ];
            if (spec.priority !== undefined) {
                lines.push(`priority: ${spec.priority}`);
            }
            if (spec.parent !== undefined) {
                lines.push(`parent: ${spec.parent}`);
            }
            lines.push("---", "");
            return Ticket.parse(`/t/${spec.id}.md`, lines.join("\n"));
        }),
    );
}

function idsOf(tickets: readonly Ticket[]): readonly string[] {
    return tickets.map((ticket) => ticket.id);
}

/** Renders rows the way the CLI will, so layout assertions read like real output. */
function render(rows: readonly TreeRow[]): readonly string[] {
    return rows.map((row) => `${row.prefix}${row.connector}${row.id}`);
}

describe("DepGraph.build", () => {
    it("indexes tickets by id", () => {
        assert.equal(graphOf([{ id: "a" }]).get("a")?.id, "a");
    });

    it("drops files without an id", () => {
        const graph = DepGraph.build([Ticket.parse("/t/x.md", "---\ntitle: \"x\"\n---\n")]);
        assert.deepEqual(idsOf(graph.tickets()), []);
    });

    it("keeps the last file when an id is duplicated", () => {
        const graph = DepGraph.build([
            Ticket.parse("/t/first.md", '---\nid: a\ntitle: "first"\n---\n'),
            Ticket.parse("/t/second.md", '---\nid: a\ntitle: "second"\n---\n'),
        ]);
        assert.equal(graph.get("a")?.title, "second");
    });

    it("preserves enumeration order", () => {
        assert.deepEqual(idsOf(graphOf([{ id: "b" }, { id: "a" }]).tickets()), ["b", "a"]);
    });
});

describe("DepGraph.isClosed", () => {
    it("is true for a closed ticket", () => {
        assert.equal(graphOf([{ id: "a", status: "closed" }]).isClosed("a"), true);
    });

    // An unknown dependency must keep blocking, never silently vanish.
    it("is false for an unknown id", () => {
        assert.equal(graphOf([]).isClosed("ghost"), false);
    });
});

describe("DepGraph.ready", () => {
    it("includes a ticket with no dependencies", () => {
        assert.deepEqual(idsOf(graphOf([{ id: "a" }]).ready()), ["a"]);
    });

    it("includes an in_progress ticket", () => {
        assert.deepEqual(idsOf(graphOf([{ id: "a", status: "in_progress" }]).ready()), ["a"]);
    });

    it("excludes a closed ticket", () => {
        assert.deepEqual(idsOf(graphOf([{ id: "a", status: "closed" }]).ready()), []);
    });

    it("includes a ticket whose dependencies are all closed", () => {
        const graph = graphOf([{ id: "a", deps: ["b"] }, { id: "b", status: "closed" }]);
        assert.deepEqual(idsOf(graph.ready()), ["a"]);
    });

    it("excludes a ticket with an open dependency", () => {
        const graph = graphOf([{ id: "a", deps: ["b"] }, { id: "b" }]);
        assert.deepEqual(idsOf(graph.ready()), ["b"]);
    });

    it("excludes a ticket whose dependency does not exist", () => {
        assert.deepEqual(idsOf(graphOf([{ id: "a", deps: ["ghost"] }]).ready()), []);
    });

    it("sorts by priority before id", () => {
        const graph = graphOf([
            { id: "a", priority: "3" },
            { id: "b", priority: "0" },
        ]);
        assert.deepEqual(idsOf(graph.ready()), ["b", "a"]);
    });

    it("compares priorities numerically, not as text", () => {
        const graph = graphOf([
            { id: "a", priority: "10" },
            { id: "b", priority: "2" },
        ]);
        assert.deepEqual(idsOf(graph.ready()), ["b", "a"]);
    });

    it("falls back to id order at equal priority", () => {
        assert.deepEqual(idsOf(graphOf([{ id: "b" }, { id: "a" }]).ready()), ["a", "b"]);
    });

    it("treats a missing priority as 2", () => {
        const graph = graphOf([
            { id: "a", priority: "3" },
            { id: "b" },
        ]);
        assert.deepEqual(idsOf(graph.ready()), ["b", "a"]);
    });
});

describe("DepGraph.blocked", () => {
    const graph = graphOf([
        { id: "a", deps: ["b", "c"] },
        { id: "b", status: "closed" },
        { id: "c" },
        { id: "d" },
    ]);

    it("lists only tickets with an unresolved dependency", () => {
        assert.deepEqual(graph.blocked().map((blocked) => blocked.ticket.id), ["a"]);
    });

    it("reports only the dependencies that are not closed", () => {
        assert.deepEqual(graph.blocked()[0]?.blockerIds, ["c"]);
    });

    it("counts an unknown dependency as a blocker", () => {
        const withGhost = graphOf([{ id: "a", deps: ["ghost"] }]);
        assert.deepEqual(withGhost.blocked()[0]?.blockerIds, ["ghost"]);
    });

    it("excludes a closed ticket even with open dependencies", () => {
        const closedBlocked = graphOf([{ id: "a", status: "closed", deps: ["b"] }, { id: "b" }]);
        assert.deepEqual(closedBlocked.blocked().map((blocked) => blocked.ticket.id), []);
    });
});

describe("DepGraph.excludingClosed", () => {
    it("drops closed tickets from the graph", () => {
        const graph = graphOf([{ id: "a" }, { id: "b", status: "closed" }]);
        assert.deepEqual(idsOf(graph.excludingClosed().tickets()), ["a"]);
    });
});

describe("DepGraph.cycles", () => {
    it("finds no cycle in an acyclic graph", () => {
        assert.deepEqual(graphOf([{ id: "a", deps: ["b"] }, { id: "b" }]).cycles(), []);
    });

    it("finds a two-node cycle", () => {
        const cycles = graphOf([{ id: "a", deps: ["b"] }, { id: "b", deps: ["a"] }]).cycles();
        assert.deepEqual(cycles.map((cycle) => cycle.pathIds), [["a", "b", "a"]]);
    });

    it("finds a self-loop", () => {
        const cycles = graphOf([{ id: "a", deps: ["a"] }]).cycles();
        assert.deepEqual(cycles.map((cycle) => cycle.pathIds), [["a", "a"]]);
    });

    it("normalizes members to start at the smallest id", () => {
        const cycles = graphOf([{ id: "b", deps: ["c"] }, { id: "c", deps: ["b"] }]).cycles();
        assert.deepEqual(cycles[0]?.memberIds, ["b", "c"]);
    });

    /**
     * The walk is entered at `c`, so the members come off the stack as c, a, b. Rotating
     * (not sorting) is what makes two spellings of the same cycle compare equal while the
     * cycle's direction survives — `["a", "b", "c"]`, never `["a", "c", "b"]`.
     */
    it("rotates the members when the smallest id is not the entry point", () => {
        const cycles = graphOf([
            { id: "c", deps: ["a"] },
            { id: "a", deps: ["b"] },
            { id: "b", deps: ["c"] },
        ]).cycles();
        assert.deepEqual(cycles[0]?.memberIds, ["a", "b", "c"]);
    });

    it("keeps the walk itself in traversal order, entry point first", () => {
        const cycles = graphOf([
            { id: "c", deps: ["a"] },
            { id: "a", deps: ["b"] },
            { id: "b", deps: ["c"] },
        ]).cycles();
        assert.deepEqual(cycles[0]?.pathIds, ["c", "a", "b", "c"]);
    });

    // Same three tickets, same cycle, reached from a fourth: normalization is what stops it
    // from being reported a second time.
    it("reports a cycle once however many entry points reach it", () => {
        const cycles = graphOf([
            { id: "c", deps: ["a"] },
            { id: "a", deps: ["b"] },
            { id: "b", deps: ["c"] },
            { id: "outside", deps: ["b"] },
        ]).cycles();
        assert.equal(cycles.length, 1);
    });

    /**
     * `depsOf()` returns `deps` VERBATIM, never deduped, so a hand-edited `deps: [a, a]` walks
     * the same back edge twice. Only the member-set dedup in `record` stops the cycle from
     * being reported twice — a second ENTRY POINT cannot exercise it, because the `done`
     * marking already prevents re-recording.
     */
    it("reports a cycle once when a duplicated dep walks the same back edge twice", () => {
        const cycles = graphOf([{ id: "a", deps: ["b"] }, { id: "b", deps: ["a", "a"] }]).cycles();
        assert.deepEqual(cycles.map((cycle) => cycle.memberIds), [["a", "b"]]);
    });

    it("reports one cycle regardless of which member is reached first", () => {
        const cycles = graphOf([
            { id: "z", deps: ["y"] },
            { id: "y", deps: ["z"] },
        ]).cycles();
        assert.equal(cycles.length, 1);
    });

    it("finds two independent cycles", () => {
        const cycles = graphOf([
            { id: "a", deps: ["b"] },
            { id: "b", deps: ["a"] },
            { id: "c", deps: ["d"] },
            { id: "d", deps: ["c"] },
        ]).cycles();
        assert.deepEqual(cycles.map((cycle) => cycle.memberIds), [["a", "b"], ["c", "d"]]);
    });

    /**
     * The two cycles SHARE `b`, so bash's abort-on-first-cycle never walked b's second back
     * edge and missed a real cycle.
     *
     * WHY the graph is listed c, b, a: the walk must ENTER at `c` and record the {a,b} cycle
     * first. Entering at `a` instead makes the aborting algorithm reach {b,c} anyway, through
     * the stack it failed to unwind — verified by mutation, that spelling of the test passes
     * against the bug.
     */
    it("finds both of two cycles overlapping in one ticket", () => {
        const cycles = graphOf([
            { id: "c", deps: ["b"] },
            { id: "b", deps: ["a", "c"] },
            { id: "a", deps: ["b"] },
        ]).cycles();
        assert.deepEqual(cycles.map((cycle) => cycle.memberIds), [["a", "b"], ["b", "c"]]);
    });

    // WHY this case: the bash DFS aborted on the first cycle and left nodes marked
    // "visiting", so a later traversal into one of them reported a non-cycle.
    // WHY `a` is listed LAST: it must be entered AFTER the {b,c} cycle has been found, which
    // is what made bash walk into a node still marked "visiting". Listing it first makes even
    // the aborting algorithm answer correctly — verified by mutation.
    it("does not invent a cycle for a node that merely points into a real cycle", () => {
        const cycles = graphOf([
            { id: "c", deps: ["b"] },
            { id: "b", deps: ["c"] },
            { id: "a", deps: ["b"] },
        ]).cycles();
        assert.deepEqual(cycles.map((cycle) => cycle.memberIds), [["b", "c"]]);
    });

    it("ignores dangling dependencies", () => {
        assert.deepEqual(graphOf([{ id: "a", deps: ["ghost"] }]).cycles(), []);
    });
});

describe("DepGraph.tree", () => {
    const options = { full: false };

    it("returns nothing for an unknown root", () => {
        assert.deepEqual(graphOf([{ id: "a" }]).tree("ghost", options), []);
    });

    it("renders a lone root", () => {
        assert.deepEqual(render(graphOf([{ id: "a" }]).tree("a", options)), ["a"]);
    });

    it("renders a chain", () => {
        const graph = graphOf([{ id: "a", deps: ["b"] }, { id: "b", deps: ["c"] }, { id: "c" }]);
        assert.deepEqual(render(graph.tree("a", options)), ["a", "└── b", "    └── c"]);
    });

    it("uses a branch connector for all but the last sibling", () => {
        const graph = graphOf([{ id: "a", deps: ["b", "c"] }, { id: "b" }, { id: "c" }]);
        assert.deepEqual(render(graph.tree("a", options)), ["a", "├── b", "└── c"]);
    });

    it("continues the vertical bar under a middle sibling", () => {
        const graph = graphOf([
            { id: "a", deps: ["b", "c"] },
            { id: "b", deps: ["d"] },
            { id: "c", deps: ["e"] },
            { id: "d" },
            { id: "e" },
        ]);
        assert.deepEqual(render(graph.tree("a", options)), [
            "a",
            "├── b",
            "│   └── d",
            "└── c",
            "    └── e",
        ]);
    });

    it("orders siblings by subtree depth, shallowest first", () => {
        const graph = graphOf([
            { id: "a", deps: ["deep", "shallow"] },
            { id: "deep", deps: ["deeper"] },
            { id: "deeper" },
            { id: "shallow" },
        ]);
        assert.deepEqual(render(graph.tree("a", options)), ["a", "├── shallow", "└── deep", "    └── deeper"]);
    });

    /**
     * `d` is reachable at depth 1 (via a) and depth 2 (via b). Default mode draws it
     * only at its deepest placement, so the diamond reads as one chain.
     */
    it("draws a shared dependency only at its deepest placement", () => {
        const graph = graphOf([
            { id: "a", deps: ["b", "d"] },
            { id: "b", deps: ["d"] },
            { id: "d" },
        ]);
        assert.deepEqual(render(graph.tree("a", options)), ["a", "└── b", "    └── d"]);
    });

    /**
     * `mid` is reachable at depth 1 and depth 2; `deep` only below it. Drawing `mid` at
     * depth 1 would strand `deep` — the dedup rule has to pick the DEEPEST placement, not
     * the first one seen.
     */
    it("draws the whole subtree under the deepest placement", () => {
        const graph = graphOf([
            { id: "a", deps: ["mid", "b"] },
            { id: "b", deps: ["mid"] },
            { id: "mid", deps: ["deep"] },
            { id: "deep" },
        ]);
        assert.deepEqual(render(graph.tree("a", options)), ["a", "└── b", "    └── mid", "        └── deep"]);
    });

    it("orders siblings of equal subtree depth by id", () => {
        const graph = graphOf([
            { id: "a", deps: ["c2", "c1", "c3"] },
            { id: "c1" },
            { id: "c2" },
            { id: "c3" },
        ]);
        assert.deepEqual(render(graph.tree("a", options)), ["a", "├── c1", "├── c2", "└── c3"]);
    });

    it("draws every path in full mode", () => {
        const graph = graphOf([
            { id: "a", deps: ["b", "d"] },
            { id: "b", deps: ["d"] },
            { id: "d" },
        ]);
        assert.deepEqual(render(graph.tree("a", { full: true })), ["a", "├── b", "│   └── d", "└── d"]);
    });

    it("stops at a cycle instead of recursing forever", () => {
        const graph = graphOf([{ id: "a", deps: ["b"] }, { id: "b", deps: ["a"] }]);
        assert.deepEqual(render(graph.tree("a", options)), ["a", "└── b"]);
    });

    it("skips a dangling dependency", () => {
        assert.deepEqual(render(graphOf([{ id: "a", deps: ["ghost"] }]).tree("a", options)), ["a"]);
    });

    /**
     * `deps` is not deduped, so `b` appears twice among the children. Bash prints it once
     * and — because the connector is chosen before the duplicate is dropped — keeps the
     * `├──` of a non-last sibling. Measured against a copy of `ticket` with the delegation
     * lists emptied.
     */
    it("prints a duplicated dependency once, keeping the branch connector", () => {
        const graph = graphOf([{ id: "a", deps: ["b", "b"] }, { id: "b" }]);
        assert.deepEqual(render(graph.tree("a", options)), ["a", "├── b"]);
    });

    it("prints a duplicated dependency twice in full mode", () => {
        const graph = graphOf([{ id: "a", deps: ["b", "b"] }, { id: "b" }]);
        assert.deepEqual(render(graph.tree("a", { full: true })), ["a", "├── b", "└── b"]);
    });

    it("reports the depth of each row", () => {
        const graph = graphOf([{ id: "a", deps: ["b"] }, { id: "b", deps: ["c"] }, { id: "c" }]);
        assert.deepEqual(graph.tree("a", options).map((row) => row.depth), [0, 1, 2]);
    });
});

describe("DepGraph relationships", () => {
    const graph = graphOf([
        { id: "target" },
        { id: "child", parent: "target" },
        // Someone else's child: without it, "has a parent at all" would pass for "children".
        { id: "other-child", parent: "elsewhere" },
        { id: "waiter", deps: ["target"] },
        { id: "done-waiter", status: "closed", deps: ["target"] },
    ]);

    it("lists children by parent field", () => {
        assert.deepEqual(idsOf(graph.children("target")), ["child"]);
    });

    it("lists only non-closed dependents", () => {
        assert.deepEqual(idsOf(graph.activeDependents("target")), ["waiter"]);
    });

    it("lists a dependent once however often it names the target", () => {
        const twice = graphOf([{ id: "target" }, { id: "waiter", deps: ["target", "target"] }]);
        assert.deepEqual(idsOf(twice.activeDependents("target")), ["waiter"]);
    });
});

describe("DepGraph.blockerIdsOf", () => {
    const graph = graphOf([
        { id: "a", deps: ["open-dep", "closed-dep", "ghost"] },
        { id: "open-dep" },
        { id: "closed-dep", status: "closed" },
    ]);

    it("keeps the not-closed dependencies in deps order", () => {
        assert.deepEqual(graph.blockerIdsOf("a"), ["open-dep", "ghost"]);
    });

    it("is empty for a ticket with no dependencies", () => {
        assert.deepEqual(graph.blockerIdsOf("open-dep"), []);
    });
});
