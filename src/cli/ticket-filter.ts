import type { Ticket } from "../core/ticket.js";

/**
 * The `--status` / `--assignee` / `--tag` selection shared by every listing command.
 *
 * An empty criterion matches everything, mirroring bash's `filter == ""` guards, so an
 * unset flag is the same as no flag.
 */
export class TicketFilter {
    constructor(
        private readonly status: string,
        private readonly assignee: string,
        private readonly tag: string,
    ) {}

    matches(ticket: Ticket): boolean {
        return this.statusMatches(ticket) && this.assigneeMatches(ticket) && this.tagMatches(ticket);
    }

    private statusMatches(ticket: Ticket): boolean {
        return this.status === "" || ticket.status === this.status;
    }

    private assigneeMatches(ticket: Ticket): boolean {
        return this.assignee === "" || ticket.assignee === this.assignee;
    }

    private tagMatches(ticket: Ticket): boolean {
        return this.tag === "" || ticket.hasTag(this.tag);
    }
}
