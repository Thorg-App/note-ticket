import { DepGraph } from "../../core/dep-graph.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { ExitCode } from "../exit-codes.js";
import { TicketRow } from "../ticket-row.js";

const NO_CYCLES = "No dependency cycles found";
const CYCLE_ARROW = " -> ";
const MEMBER_INDENT = "  ";
const CYCLE_SEPARATOR = "";

/**
 * `dep cycle`: every dependency cycle among the tickets that are still open.
 *
 * Closed tickets are dropped first — a cycle that is already finished is not a problem
 * anyone can act on, and bash excluded them the same way.
 */
export class DepCycleCommand {
    static run(store: TicketStore): number {
        const tickets = store.loadAll();
        // An empty tickets dir prints NOTHING, not "No dependency cycles found": bash
        // returns before its awk ever runs. Verified against ./ticket.
        if (tickets.length === 0) {
            return ExitCode.SUCCESS;
        }
        process.stdout.write(DepCycleCommand.render(DepGraph.build(tickets)));
        return ExitCode.SUCCESS;
    }

    /**
     * `Cycle N: a -> b -> a` followed by one indented row per member, blank line between
     * cycles.
     *
     * DIVERGENCE (deliberate, divergence #1 in `docs-internal/migration-to-ts-high-level.md`): bash aborted
     * its DFS at the first cycle and left the nodes it had entered marked "visiting", so it
     * printed walks that were not cycles and missed real ones. This reports every cycle
     * once, keyed by its members.
     */
    static render(graph: DepGraph): string {
        const open = graph.excludingClosed();
        const cycles = open.cycles();
        if (cycles.length === 0) {
            return TicketRow.text([NO_CYCLES]);
        }
        const rows: string[] = [];
        cycles.forEach((cycle, index) => {
            if (index > 0) {
                rows.push(CYCLE_SEPARATOR);
            }
            rows.push(`Cycle ${index + 1}: ${cycle.pathIds.join(CYCLE_ARROW)}`);
            for (const id of cycle.memberIds) {
                rows.push(`${MEMBER_INDENT}${TicketRow.paddedIdentified(id, open.get(id))}`);
            }
        });
        return TicketRow.text(rows);
    }
}
