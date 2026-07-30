import type { Ticket } from "../core/ticket.js";

/**
 * The `--status` / `--assignee` / `--tag` selection shared by every listing command.
 *
 * An empty criterion matches everything, mirroring bash's `filter == ""` guards, so an
 * unset flag is the same as no flag.
 */
export class TicketFilter {
    constructor(
        /**
         * Literal text compared against the status ON DISK — deliberately NOT a
         * `TicketStatus`. Bash never validates `--status=`, so `--status=bogus` (and
         * `--status=done`, which no command writes) must list nothing rather than fail.
         */
        private readonly statusFilter: string,
        private readonly assignee: string,
        private readonly tag: string,
    ) {}

    matches(ticket: Ticket): boolean {
        return this.statusMatches(ticket) && this.assigneeMatches(ticket) && this.tagMatches(ticket);
    }

    /**
     * The same filter with the status criterion dropped.
     *
     * WHY: only `ls` takes `--status`. `ready`/`blocked` fix the status set themselves and
     * `closed` fixes it to closed|done, so all three IGNORE a `--status=` on the command
     * line (bash never looks at it there). Verified against ./ticket.
     */
    ignoringStatus(): TicketFilter {
        return new TicketFilter("", this.assignee, this.tag);
    }

    private statusMatches(ticket: Ticket): boolean {
        return this.statusFilter === "" || ticket.status === this.statusFilter;
    }

    private assigneeMatches(ticket: Ticket): boolean {
        return this.assignee === "" || ticket.assignee === this.assignee;
    }

    private tagMatches(ticket: Ticket): boolean {
        return this.tag === "" || ticket.hasTag(this.tag);
    }
}
