import { DepGraph } from "../../core/dep-graph.js";
import type { Ticket } from "../../core/ticket.js";
import type { ListOptions } from "../list-options.js";
import { TicketRow } from "../ticket-row.js";

/**
 * `ready`: open/in-progress tickets whose every dependency is closed.
 *
 * WHY the filter is applied to the result rather than to the graph: dependency statuses
 * are looked up across ALL tickets, so filtering the population first would make an
 * excluded dependency look unknown. Order is unaffected — the filter is per ticket.
 */
export class ReadyCommand {
    static render(tickets: readonly Ticket[], options: ListOptions): string {
        const ready = DepGraph.build(tickets).ready();
        const filter = options.filterIgnoringStatus;
        const rows = ready.filter((ticket) => filter.matches(ticket)).map((ticket) => TicketRow.withPriority(ticket));
        return TicketRow.text(rows);
    }
}
