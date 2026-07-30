import type { BlockedTicket } from "../core/dep-graph.js";
import type { Ticket } from "../core/ticket.js";

/**
 * Width bash's `printf "%-8s"` gives the id column; longer ids are NOT truncated.
 *
 * WHY-NOT byte-accurate padding: bash pads to 8 BYTES, `padEnd` to 8 UTF-16 units, so a
 * non-ASCII id would pad differently. Generated ids are `[a-z0-9]`, so the two agree for
 * every id `create` can produce; only a hand-written non-ASCII id could differ.
 */
const ID_COLUMN_WIDTH = 8;

const ROW_SEPARATOR = "\n";
const RELATED_IDS_MARKER = " <- ";

/**
 * One rendered line per listing command.
 *
 * Every method reproduces a bash `printf` for an ASCII id byte for byte, trailing space
 * included: a ticket with no title really does end in `- `.
 *
 * DIVERGENCE (deliberate): bash `ready`/`blocked` pack their sort key as
 * `prio|id|status|title` and `split()` it back apart, so they truncate any title at its
 * first `|`. These rows print the title whole; see CHANGELOG and `scripts/parity/README.md`.
 */
export class TicketRow {
    /** `<id> [<status>] - <title>` — the row `closed` prints and `withDeps` builds on. */
    static withStatus(ticket: Ticket): string {
        return `${TicketRow.idColumn(ticket)} [${ticket.status}] - ${ticket.title}`;
    }

    /** `withStatus` plus ` <- [dep, dep]` when there are deps — the `ls` row. */
    static withDeps(ticket: Ticket): string {
        return `${TicketRow.withStatus(ticket)}${TicketRow.relatedIds(ticket.deps)}`;
    }

    /** `<id> [P<priority>][<status>] - <title>` — the `ready` row. */
    static withPriority(ticket: Ticket): string {
        return `${TicketRow.idColumn(ticket)} [P${ticket.priority}][${ticket.status}] - ${ticket.title}`;
    }

    /** `withPriority` plus ` <- [blocker, ...]` — the `blocked` row. */
    static withBlockers(blocked: BlockedTicket): string {
        return `${TicketRow.withPriority(blocked.ticket)}${TicketRow.relatedIds(blocked.blockerIds)}`;
    }

    /** Rows as printable output: one trailing newline each, empty text for no rows. */
    static text(rows: readonly string[]): string {
        return rows.map((row) => `${row}${ROW_SEPARATOR}`).join("");
    }

    private static idColumn(ticket: Ticket): string {
        return ticket.id.padEnd(ID_COLUMN_WIDTH);
    }

    /** ` <- [a, b]`, or nothing at all when the list is empty (bash omits the marker). */
    private static relatedIds(ids: readonly string[]): string {
        return ids.length === 0 ? "" : `${RELATED_IDS_MARKER}[${ids.join(", ")}]`;
    }
}
