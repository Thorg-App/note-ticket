/**
 * The graph commands (`dep tree`, `dep cycle`, `show`) and the id lookup they share.
 * Every expected string here was captured from bash `./ticket`; see also `make parity`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CliError, UsageError } from "../src/cli/cli-error.js";
import { DepCycleCommand } from "../src/cli/commands/dep-cycle.js";
import { DepTreeCommand } from "../src/cli/commands/dep-tree.js";
import { ShowCommand } from "../src/cli/commands/show.js";
import { TicketLookup } from "../src/cli/ticket-lookup.js";
import { DepGraph } from "../src/core/dep-graph.js";
import { Ticket } from "../src/core/ticket.js";

interface TicketSpec {
    readonly id: string;
    readonly title?: string;
    readonly status?: string;
    readonly deps?: readonly string[];
    readonly links?: readonly string[];
    readonly parent?: string;
    /** Everything after the closing `---`, written verbatim. */
    readonly body?: string;
}

function ticketOf(spec: TicketSpec): Ticket {
    const lines = ["---", `id: ${spec.id}`, `title: "${spec.title ?? spec.id}"`, `status: ${spec.status ?? "open"}`];
    lines.push(`deps: [${(spec.deps ?? []).join(", ")}]`);
    lines.push(`links: [${(spec.links ?? []).join(", ")}]`);
    if (spec.parent !== undefined) {
        lines.push(`parent: ${spec.parent}`);
    }
    lines.push("---");
    return Ticket.parse(`/t/${spec.id}.md`, `${lines.join("\n")}\n${spec.body ?? ""}`);
}

function ticketsOf(specs: readonly TicketSpec[]): readonly Ticket[] {
    return specs.map(ticketOf);
}

function graphOf(specs: readonly TicketSpec[]): DepGraph {
    return DepGraph.build(ticketsOf(specs));
}

/** The `show` output for the first spec, against a graph of all of them. */
function shownFor(specs: readonly TicketSpec[]): string {
    const tickets = ticketsOf(specs);
    return ShowCommand.render(tickets[0] as Ticket, DepGraph.build(tickets));
}

describe("DepTreeCommand.render", () => {
    it("prints the root with its status and title", () => {
        assert.equal(DepTreeCommand.render(graphOf([{ id: "a", title: "Root" }]), "a", false), "a [open] Root\n");
    });

    it("prints a child behind its connector", () => {
        const graph = graphOf([{ id: "a", deps: ["b"] }, { id: "b", title: "Child" }]);
        assert.equal(DepTreeCommand.render(graph, "a", false), "a [open] a\n└── b [open] Child\n");
    });

    // Unlike `show`, the tree drops the dangling id entirely: bash's `build_children` skips
    // any child that is `!(child in max_depth)`, and only real tickets get a max_depth.
    it("omits a dangling dependency from the tree, even in --full mode", () => {
        const graph = graphOf([{ id: "a", deps: ["ghost"] }]);
        assert.equal(DepTreeCommand.render(graph, "a", true), "a [open] a\n");
    });

    it("prints nothing at all for an unknown root", () => {
        assert.equal(DepTreeCommand.render(graphOf([{ id: "a" }]), "ghost", false), "");
    });
});

describe("DepCycleCommand.render", () => {
    it("says so when there is no cycle", () => {
        assert.equal(DepCycleCommand.render(graphOf([{ id: "a" }])), "No dependency cycles found\n");
    });

    it("prints the walk and one padded row per member", () => {
        const graph = graphOf([
            { id: "a", deps: ["b"], title: "A" },
            { id: "b", deps: ["a"], title: "B" },
        ]);
        assert.equal(
            DepCycleCommand.render(graph),
            "Cycle 1: a -> b -> a\n  a        [open] A\n  b        [open] B\n",
        );
    });

    it("separates two cycles with a blank line", () => {
        const graph = graphOf([
            { id: "a", deps: ["b"] },
            { id: "b", deps: ["a"] },
            { id: "c", deps: ["d"] },
            { id: "d", deps: ["c"] },
        ]);
        assert.equal(DepCycleCommand.render(graph).split("\n\n").length, 2);
    });

    it("ignores a cycle among closed tickets", () => {
        const graph = graphOf([
            { id: "a", status: "closed", deps: ["b"] },
            { id: "b", status: "closed", deps: ["a"] },
        ]);
        assert.equal(DepCycleCommand.render(graph), "No dependency cycles found\n");
    });
});

describe("ShowCommand.render", () => {
    it("echoes the file as it is on disk", () => {
        const shown = shownFor([{ id: "a", title: "A", body: "\nDescription\n" }]);
        assert.equal(shown, '---\nid: a\ntitle: "A"\nstatus: open\ndeps: []\nlinks: []\n---\n\nDescription\n');
    });

    // awk's `getline` treats the final newline as a terminator, so a file without one
    // gains it here. Reproduced so bash and TS are byte-identical on such a file.
    it("terminates a file that does not end in a newline", () => {
        assert.ok(shownFor([{ id: "a", body: "\nno trailing newline" }]).endsWith("no trailing newline\n"));
    });

    it("annotates the parent line with the parent's title", () => {
        const shown = shownFor([{ id: "a", parent: "p" }, { id: "p", title: "The parent" }]);
        assert.ok(shown.includes("parent: p  # The parent\n"));
    });

    it("leaves the parent line alone when the parent is unknown", () => {
        assert.ok(shownFor([{ id: "a", parent: "ghost" }]).includes("parent: ghost\n"));
    });

    // Only the frontmatter's parent line is rewritten; prose that starts the same way is prose.
    it("does not annotate a parent line in the body", () => {
        const shown = shownFor([{ id: "a", body: "\nparent: p\n" }, { id: "p", title: "The parent" }]);
        assert.ok(shown.endsWith("\nparent: p\n"));
    });

    it("lists the dependencies that are not closed under Blockers", () => {
        const shown = shownFor([
            { id: "a", deps: ["open-dep", "closed-dep"] },
            { id: "open-dep", title: "Still open" },
            { id: "closed-dep", status: "closed" },
        ]);
        assert.ok(shown.endsWith("\n## Blockers\n\n- open-dep [open] Still open\n"));
    });

    it("omits Blockers when every dependency is closed", () => {
        const shown = shownFor([{ id: "a", deps: ["b"] }, { id: "b", status: "closed" }]);
        assert.ok(!shown.includes("## Blockers"));
    });

    // bash looked the id up in an awk array and got the empty string for both fields.
    it("lists a dangling dependency with empty status and title", () => {
        assert.ok(shownFor([{ id: "a", deps: ["ghost"] }]).endsWith("- ghost [] \n"));
    });

    it("lists non-closed dependents under Blocking", () => {
        const shown = shownFor([{ id: "a" }, { id: "waiter", title: "Waiting", deps: ["a"] }]);
        assert.ok(shown.endsWith("\n## Blocking\n\n- waiter [open] Waiting\n"));
    });

    it("lists tickets that name the target as parent under Children", () => {
        const shown = shownFor([{ id: "a" }, { id: "kid", title: "Kid", parent: "a" }]);
        assert.ok(shown.endsWith("\n## Children\n\n- kid [open] Kid\n"));
    });

    it("lists links under Linked", () => {
        const shown = shownFor([{ id: "a", links: ["other"] }, { id: "other", title: "Other" }]);
        assert.ok(shown.endsWith("\n## Linked\n\n- other [open] Other\n"));
    });

    // `deps`/`links` are NOT deduplicated, and bash prints one row per ENTRY. Only the
    // computed `## Blocking` section drops duplicates (divergence #8).
    it("repeats a dependency listed twice under Blockers", () => {
        const shown = shownFor([{ id: "a", deps: ["dup", "dup"] }, { id: "dup", title: "Twice" }]);
        assert.ok(shown.endsWith("\n## Blockers\n\n- dup [open] Twice\n- dup [open] Twice\n"));
    });

    it("repeats a link listed twice under Linked", () => {
        const shown = shownFor([{ id: "a", links: ["dup", "dup"] }, { id: "dup", title: "Twice" }]);
        assert.ok(shown.endsWith("\n## Linked\n\n- dup [open] Twice\n- dup [open] Twice\n"));
    });

    it("orders the sections Blockers, Blocking, Children, Linked", () => {
        const shown = shownFor([
            { id: "a", deps: ["dep"], links: ["link"] },
            { id: "dep" },
            { id: "link" },
            { id: "waiter", deps: ["a"] },
            { id: "kid", parent: "a" },
        ]);
        const headings = shown.split("\n").filter((line) => line.startsWith("## "));
        assert.deepEqual(headings, ["## Blockers", "## Blocking", "## Children", "## Linked"]);
    });
});

describe("TicketLookup", () => {
    const tickets = ticketsOf([{ id: "abc", title: "Short" }, { id: "abc-1234", title: "Long" }]);

    it("resolves an exact id even when it is a prefix of another", () => {
        assert.equal(TicketLookup.byId(tickets, "abc").title, "Short");
    });

    it("resolves a partial id", () => {
        assert.equal(TicketLookup.byId(tickets, "1234").title, "Long");
    });

    it("trims the search", () => {
        assert.equal(TicketLookup.byId(tickets, " abc ").title, "Short");
    });

    it("reports an ambiguous partial id", () => {
        assert.throws(() => TicketLookup.byId(tickets, "ab"), {
            message: "ambiguous ID 'ab' matches multiple tickets",
        });
    });

    it("reports an unknown id", () => {
        assert.throws(() => TicketLookup.byId(tickets, "zz"), { message: "ticket 'zz' not found" });
    });

    // The divergence this port introduces: bash resolved "" to the only ticket in a
    // one-ticket repo, so `tk show "$UNSET_VAR"` acted on an arbitrary ticket.
    it("matches nothing for an empty id", () => {
        assert.throws(() => TicketLookup.byId(ticketsOf([{ id: "only" }]), ""), {
            message: "ticket '' not found",
        });
    });

    it("keeps bash's own wording for a dep tree root", () => {
        assert.throws(() => TicketLookup.treeRootId(tickets, "zz"), { message: "ticket zz not found" });
    });

    it("resolves a dep tree root that is a substring of another id", () => {
        assert.equal(TicketLookup.treeRootId(tickets, "abc"), "abc");
    });
});

describe("UsageError", () => {
    it("prints its lines with no Error: prefix, as bash does", () => {
        assert.equal(new UsageError(["Usage: ticket show <id>"]).stderrText, "Usage: ticket show <id>\n");
    });

    it("is a CliError, so the dispatcher renders and exits on it", () => {
        assert.ok(new UsageError(["Usage: x"]) instanceof CliError);
    });
});
