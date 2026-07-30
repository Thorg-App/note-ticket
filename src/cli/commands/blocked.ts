import { DepGraph } from "../../core/dep-graph.js";
import type { Ticket } from "../../core/ticket.js";
import type { ListOptions } from "../list-options.js";
import { TicketRow } from "../ticket-row.js";

/**
 * `blocked`: open/in-progress tickets with at least one dependency that is not closed.
 * Only the unresolved dependencies are listed after `<-`.
 *
 * See `ReadyCommand` for why the filter runs on the result rather than the population.
 */
export class BlockedCommand {
    static render(tickets: readonly Ticket[], options: ListOptions): string {
        const blocked = DepGraph.build(tickets).blocked();
        const filter = options.filterIgnoringStatus;
        const rows = blocked
            .filter((entry) => filter.matches(entry.ticket))
            .map((entry) => TicketRow.withBlockers(entry));
        return TicketRow.text(rows);
    }
}
