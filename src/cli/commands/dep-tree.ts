import { DepGraph } from "../../core/dep-graph.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { UsageError } from "../cli-error.js";
import { ExitCode } from "../exit-codes.js";
import { TicketLookup } from "../ticket-lookup.js";
import { TicketRow } from "../ticket-row.js";

const USAGE = "Usage: ticket dep tree [--full] <id>";
const FULL_FLAG = "--full";

/** No id given at all — bash's own check, and the only argument error the command has. */
const NO_ROOT = "";

/**
 * `dep tree [--full] <id>`: the dependency graph below one ticket, as a drawn tree.
 *
 * Default mode draws each ticket ONCE, at its deepest position, so a diamond reads as the
 * single longest chain; `--full` draws every path. The layout itself is `DepGraph.tree`.
 */
export class DepTreeCommand {
    /** WHY the parse comes first: bash reports a missing id before it ever reads the files. */
    static run(store: TicketStore, args: readonly string[]): number {
        const options = DepTreeCommand.parse(args);
        const tickets = store.loadAll();
        // Nothing to enumerate: bash returns BEFORE resolving the id, so an unknown root in
        // an empty tickets dir succeeds silently. Verified against ./ticket.
        if (tickets.length === 0) {
            return ExitCode.SUCCESS;
        }
        // Resolved against the GRAPH, not the files: two files carrying the same id collapse
        // into one node (last one wins), and bash resolved the root out of that same
        // id-keyed table — so a duplicated id is not an ambiguous search here.
        const graph = DepGraph.build(tickets);
        const rootId = TicketLookup.treeRootId(graph.tickets(), options.rootId);
        process.stdout.write(DepTreeCommand.render(graph, rootId, options.full));
        return ExitCode.SUCCESS;
    }

    /** The drawn tree, one row per line. */
    static render(graph: DepGraph, rootId: string, full: boolean): string {
        const rows = graph.tree(rootId, { full }).map((row) => {
            return `${row.prefix}${row.connector}${TicketRow.identified(row.id, graph.get(row.id))}`;
        });
        return TicketRow.text(rows);
    }

    /**
     * bash loops over every argument, treating `--full` as the flag and ANY other argument
     * as the root — so the LAST non-flag argument wins and a flag may follow the id.
     * Verified against ./ticket.
     */
    private static parse(args: readonly string[]): { readonly full: boolean; readonly rootId: string } {
        let full = false;
        let rootId = NO_ROOT;
        for (const arg of args) {
            if (arg === FULL_FLAG) {
                full = true;
            } else {
                rootId = arg;
            }
        }
        if (rootId === NO_ROOT) {
            throw new UsageError([USAGE]);
        }
        return { full, rootId };
    }
}
