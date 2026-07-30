import type { Ticket } from "../../core/ticket.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { ExitCode } from "../exit-codes.js";
import { Jq } from "../jq.js";

const LINE_SEPARATOR = "\n";

/** No filter given; bash's `filter` starts empty and an empty filter means "print everything". */
const NO_FILTER = "";

/**
 * `query [jq-filter]`: every ticket as one JSON object per line, `full_path` last.
 *
 * Frontmatter key order is the file's own order — the JSONL is the machine-readable view of
 * the files, so it must not reorder or normalise them.
 */
export class QueryCommand {
    static run(store: TicketStore, args: readonly string[]): number {
        const tickets = store.loadAll();
        // Bash returns BEFORE reaching jq when there is nothing to enumerate, so an
        // unparseable filter against an empty tickets dir succeeds silently. Verified.
        if (tickets.length === 0) {
            return ExitCode.SUCCESS;
        }
        const jsonl = QueryCommand.jsonl(tickets);
        const filter = QueryCommand.filterFrom(args);
        if (filter === NO_FILTER) {
            process.stdout.write(jsonl);
            return ExitCode.SUCCESS;
        }
        return Jq.select(jsonl, filter);
    }

    /**
     * One JSON line per ticket, in enumeration (path) order.
     *
     * WHY no "has any frontmatter field" guard like bash's `field_count > 0`: a file with no
     * fields has no `id` either, and `TicketStore.load` rejects such a file outright, so every
     * ticket reaching here has fields. (That rejection is the one declared divergence: bash
     * silently skipped the file and printed a bare blank line.)
     */
    static jsonl(tickets: readonly Ticket[]): string {
        return tickets.map((ticket) => `${ticket.toJsonText()}${LINE_SEPARATOR}`).join("");
    }

    /**
     * The jq filter: bash's arg loop assigns `filter="$1"` for EVERY argument, so the LAST
     * one wins and nothing is treated as a flag — `query --pretty .id` filters on `.id`.
     * Verified against ./ticket.
     */
    static filterFrom(args: readonly string[]): string {
        return args.length === 0 ? NO_FILTER : (args[args.length - 1] as string);
    }
}
