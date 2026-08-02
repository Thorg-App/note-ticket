/**
 * The frontmatter change a status move makes. Pure — no I/O, no output — so the resulting
 * file bytes (key order included) can be asserted directly. Shared by the CLI's `status`
 * family and the library's `TicketManager.setStatus`.
 */

import { TICKET_STATUS_CLOSED, type Ticket, TicketField, type TicketStatus } from "./ticket.js";

export class StatusUpdate {
    /**
     * The ticket with its status and stamps updated. `closed_iso` records when work ENDED, so
     * it is written only while the ticket is closed and dropped again on any other status —
     * a reopened ticket that kept a `closed_iso` would misreport as finished work.
     *
     * A field the file does not have yet is inserted as the FIRST frontmatter entry
     * (`Frontmatter.withField`), which is where bash's `sed` insert lands it.
     */
    static applied(ticket: Ticket, status: TicketStatus, now: string): Ticket {
        const updated = ticket
            .withField(TicketField.STATUS, status)
            .withField(TicketField.STATUS_UPDATED_ISO, now);
        return status === TICKET_STATUS_CLOSED
            ? updated.withField(TicketField.CLOSED_ISO, now)
            : updated.withoutField(TicketField.CLOSED_ISO);
    }
}
