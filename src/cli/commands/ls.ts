import type { Ticket } from "../../core/ticket.js";
import type { ListOptions } from "../list-options.js";
import { TicketRow } from "../ticket-row.js";

/**
 * `ls` / `list`: every matching ticket in enumeration (path) order.
 *
 * No sorting and no de-duplication by id — two files carrying the same id are two rows,
 * as in bash, which emits per file.
 */
export class LsCommand {
    static render(tickets: readonly Ticket[], options: ListOptions): string {
        const rows = tickets.filter((ticket) => options.filter.matches(ticket)).map((ticket) => TicketRow.withDeps(ticket));
        return TicketRow.text(rows);
    }
}
