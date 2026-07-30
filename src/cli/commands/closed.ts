import type { Ticket } from "../../core/ticket.js";
import type { TicketStore } from "../../core/ticket-store.js";
import type { ListOptions } from "../list-options.js";
import { RowLimit } from "../row-limit.js";
import { TicketRow } from "../ticket-row.js";

/**
 * Ticket files `closed` looks at, most recently modified first.
 *
 * WHY a cap, and WHY before filtering: bash keeps only `ls -t … | head -n 100` and parses
 * those, so a closed ticket sitting behind 100 more recently touched files is simply not
 * listed — `--limit` cannot bring it back. Reproducing the cap is what makes the command's
 * cost independent of repo size; reproducing its POSITION is what makes the output match.
 */
const SCANNED_FILE_LIMIT = 100;

/**
 * `closed`: recently finished tickets, newest first by file modification time.
 *
 * Order is mtime, NOT priority or id, and there is no de-duplication by id — one row per
 * file, as in bash.
 */
export class ClosedCommand {
    static render(store: TicketStore, options: ListOptions): string {
        return ClosedCommand.renderTickets(store.loadRecent(SCANNED_FILE_LIMIT), options);
    }

    /**
     * The pure half: already-capped tickets in newest-first order to printable rows.
     *
     * `--limit` is applied LAST, to the surviving rows — not to the files scanned.
     */
    static renderTickets(recentFirst: readonly Ticket[], options: ListOptions): string {
        // `--status` is ignored here, as in bash: `closed` fixes the status set itself.
        const filter = options.filterIgnoringStatus;
        const limit = RowLimit.parse(options.limitText);
        const rows = recentFirst
            .filter((ticket) => ticket.isFinished && filter.matches(ticket))
            .map((ticket) => TicketRow.withStatus(ticket));
        return TicketRow.text(limit.applyTo(rows));
    }
}
